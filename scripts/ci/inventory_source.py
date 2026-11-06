"""Extract the CI contract's quoted test names without evaluating JavaScript.

This is a small lexical reader, not a JavaScript parser. Each cursor only moves
forward; quoted strings, comments, regexes and template text are opaque. Template
interpolations return to code so a literal test there cannot disappear.
"""

_LINE_TERMINATORS = '\r\n\u2028\u2029'
_CONTROL_WORDS = {'if', 'while', 'for', 'with', 'switch', 'catch'}
# Reserved expression prefixes must not fall through to the identifier/value
# case: e.g. `export default /.../`, `new /.../.constructor`, `extends /.../`.
_EXPRESSION_PREFIX = {
    'return', 'throw', 'case', 'typeof', 'void', 'delete', 'new', 'default',
    'extends', 'yield', 'await', 'else', 'do', 'break', 'continue', 'debugger',
    'in', 'instanceof',
}
_UNSUPPORTED_PREFIX = {
    'class', 'const', 'enum', 'export', 'finally', 'function', 'import', 'let',
    'try', 'var', 'implements', 'interface', 'package', 'private', 'protected',
    'public', 'static',
}


def _tokens(source):
    i, size = 0, len(source)
    previous = None
    parens = []
    templates = []
    template_text = False
    line_break = False

    def quoted(start, delimiter):
        end = start + 1
        while end < size:
            char = source[end]
            if char == '\\':
                end += 2
            elif char == delimiter:
                return end + 1
            elif char in _LINE_TERMINATORS:
                raise ValueError('Unterminated quoted string in test source')
            else:
                end += 1
        raise ValueError('Unterminated quoted string in test source')

    while i < size:
        char = source[i]
        if template_text:
            if char == '\\':
                i += 2
            elif char == '`':
                templates.pop()
                template_text = False
                previous = 'value'
                i += 1
            elif source.startswith('${', i):
                templates[-1] = 1
                template_text = False
                previous = None
                i += 2
            else:
                i += 1
            continue
        if char.isspace():
            line_break = line_break or char in _LINE_TERMINATORS
            i += 1
            continue
        if source.startswith('//', i) or (i == 0 and source.startswith('#!', i)):
            i += 2
            while i < size and source[i] not in _LINE_TERMINATORS:
                i += 1
            continue
        if source.startswith('/*', i):
            end = source.find('*/', i + 2)
            if end < 0:
                raise ValueError('Unterminated comment in test source')
            line_break = line_break or any(c in source[i:end + 2] for c in _LINE_TERMINATORS)
            i = end + 2
            continue
        # ASI can put a regex after a completed import/export declaration whose
        # last token looks like an expression value. Without statement parsing,
        # do not assume division across a line terminator (including comments).
        if char == '/' and line_break and previous in ['value', ']']:
            raise ValueError('Ambiguous slash across line terminator in test source')
        line_break = False
        if char in "'\"":
            end = quoted(i, char)
            yield ('string', source[i + 1:end - 1])
            previous, i = 'value', end
            continue
        if char == '`':
            yield ('template', '`')
            templates.append(0)
            template_text = True
            i += 1
            continue
        # A slash after '}' or contextual 'of' needs parser context. Reject it
        # rather than let regex quotes hide later declarations as string text.
        if char == '/' and previous in ['}', 'of', 'label', 'ambiguous']:
            raise ValueError('Ambiguous slash in test source')
        if source.startswith(('++', '--'), i):
            yield ('value', source[i:i + 2])
            previous = 'value'
            i += 2
            continue
        # Regexes are possible where an expression can start; after a value or
        # ']' a slash is division. This reader deliberately rejects ambiguous
        # statement-position forms instead of implementing a JavaScript parser.
        if char == '/' and previous not in ['value', ']']:
            i += 1
            in_class = False
            while i < size:
                char = source[i]
                if char in _LINE_TERMINATORS:
                    raise ValueError('Unterminated regex in test source')
                if char == '\\':
                    i += 2
                    continue
                if char == '/' and not in_class:
                    i += 1
                    break
                if char == '[':
                    if in_class:
                        raise ValueError('Unsupported nested regex class in test source')
                    in_class = True
                elif char == ']':
                    in_class = False
                i += 1
            else:
                raise ValueError('Unterminated regex in test source')
            while i < size and source[i].isalpha():
                i += 1
            yield ('value', 'regex')
            previous = 'value'
            continue
        if char.isalnum() or char in '_$':
            end = i + 1
            while end < size and (source[end].isalnum() or source[end] in '_$'):
                end += 1
            word = source[i:end]
            yield ('word', word)
            if previous in ['break', 'continue']:
                previous = 'label'
            elif previous == '.':
                previous = 'value'
            elif word in _EXPRESSION_PREFIX or word in _CONTROL_WORDS or word == 'of':
                previous = word
            elif word in _UNSUPPORTED_PREFIX:
                previous = 'ambiguous'
            else:
                previous = 'value'
            i = end
            continue
        if templates:
            if char == '{':
                templates[-1] += 1
            elif char == '}':
                templates[-1] -= 1
                if templates[-1] == 0:
                    template_text = True
        yield ('punct', char)
        if char == '(':
            parens.append(None if previous == 'await' else previous in _CONTROL_WORDS)
            previous = char
        elif char == ')':
            if not parens:
                raise ValueError('Unbalanced parentheses in test source')
            control = parens.pop()
            previous = 'ambiguous' if control is None else ('control' if control else 'value')
        else:
            previous = char
        i += 1
    if templates:
        raise ValueError('Unterminated template in test source')
    if parens:
        raise ValueError('Unbalanced parentheses in test source')


def test_names(source):
    """Yield simple/double-quoted test(...) names with legacy normalization.

    Nonliteral names are outside the existing static inventory. Once a quoted
    first argument starts, it must be complete and followed by a comma; composed
    names must never silently become a shorter mandatory name.
    """
    recent = []
    pending = None
    for kind, value in _tokens(source):
        if pending is not None:
            if (kind, value) != ('punct', ','):
                raise ValueError('Unsupported composed test name in test source')
            yield pending.replace("\\'", "'").replace('\\"', '"')
            pending = None
        if recent[-2:] == [('word', 'test'), ('punct', '(')] and kind == 'string':
            pending = value
        recent.append((kind, value))
        recent = recent[-2:]
    if pending is not None:
        raise ValueError('Incomplete test declaration in test source')

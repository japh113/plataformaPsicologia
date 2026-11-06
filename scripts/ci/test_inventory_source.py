import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import inventory_source

from common import inventory, parse_tap
from inventory_source import test_names


class InventorySource(unittest.TestCase):
    def _node_report(self, source):
        # CI already supplies Node. Locally the same commands may use an
        # ephemeral, resource-limited Node container through PATH; no packages.
        base = ['node', '--max-old-space-size=64', '--input-type=module']
        syntax = subprocess.run([*base, '--check'], input=source, capture_output=True, text=True, timeout=10)
        self.assertEqual(syntax.returncode, 0, syntax.stderr)
        result = subprocess.run([*base, '--test-reporter=tap'], input=source, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = parse_tap(result.stdout)
        self.assertTrue(report['complete'])
        self.assertEqual([t['name'] for t in report['tests']], ['visible'])
        self.assertFalse(report['failed'] or report['skipped'] or report['cancelled'])
        return report

    def _inventory_source(self, source, report):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture.mjs'
            path.write_text(source)
            return inventory(report, [path])

    def test_export_default_regex_cannot_hide_an_unexecuted_literal(self):
        lines = ["import test from 'node:test';", 'export default /"/;',
                 "if (false) test('hidden', () => {});", '/"/;',
                 "test('visible', () => {});"]
        # Test both the exact multiline report and the one-line form, which
        # previously swallowed hidden inside the apparent quoted string.
        for separator in ['\n', ' ']:
            with self.subTest(separator=repr(separator)):
                source = separator.join(lines)
                report = self._node_report(source)
                self.assertEqual(list(test_names(source)), ['hidden', 'visible'])
                with self.assertRaisesRegex(ValueError, 'Declared test cases did not execute:.*hidden'):
                    self._inventory_source(source, report)

    def test_export_default_regex_does_not_declare_phantom_tests(self):
        source = '''import test from 'node:test';
          export default /test('phantom',x)/;
          const text="test('string phantom',x)";
          const template=`test('template phantom',x)`;
          /* test('comment phantom',x) */
          test('visible',()=>{});'''
        report = self._node_report(source)
        self.assertEqual(list(test_names(source)), ['visible'])
        self.assertEqual(self._inventory_source(source, report)['declaredCases'], ['visible'])

    def test_equivalent_regex_expression_prefixes_preserve_inventory_rejection(self):
        prefixes = [
            'export default /"/;',
            'const value = new /"/.constructor();',
            'class Derived extends /"/.constructor {}',
            'const value = typeof /"/;', 'const value = void /"/;',
            'const value = delete /"/.unused;',
            'function f() { return /"/; }', 'function f() { throw /"/; }',
            'function* f() { yield /"/; }', 'async function f() { await /"/; }',
            'const value = "x" instanceof /"/.constructor;',
            'const value = "x" in /"/;', 'if (true) /"/;',
            'switch (1) { case /"/: break; }', 'do /"/; while (false);',
            'if (false) {} else /"/;', 'const f = () => /"/;',
        ]
        for prefix in prefixes:
            with self.subTest(prefix=prefix):
                source = ("import test from 'node:test'; " + prefix +
                          " if(false) test('hidden',()=>{}); /\"/; test('visible',()=>{});")
                report = self._node_report(source)
                self.assertEqual(list(test_names(source)), ['hidden', 'visible'])
                with self.assertRaisesRegex(ValueError, 'Declared test cases did not execute:.*hidden'):
                    self._inventory_source(source, report)

    def test_statement_boundaries_preserve_inventory_rejection(self):
        for separator in ['\n', '/*\n*/', '\u2028', '// ASI\n']:
            with self.subTest(separator=repr(separator)):
                source = ("import test from 'node:test'; import 'node:test'" + separator +
                          "/\"/; if(false) test('hidden',()=>{}); /\"/; test('visible',()=>{});")
                report = self._node_report(source)
                self.assertEqual(list(test_names(source)), ['hidden', 'visible'])
                with self.assertRaisesRegex(ValueError, 'Declared test cases did not execute:.*hidden'):
                    self._inventory_source(source, report)

    def test_reserved_property_names_remain_values_for_division(self):
        source = '''import test from 'node:test';
          const object={default:8,new:8,extends:8,import:8};
          const values=[object.default / 2,object.new / 2,object.extends / 2,object.import / 2];
          test('visible',()=>{});'''
        report = self._node_report(source)
        self.assertEqual(self._inventory_source(source, report)['declaredCases'], ['visible'])

    def _reject_hidden(self, source):
        report = self._node_report(source)
        self.assertEqual(list(test_names(source)), ['hidden', 'visible'])
        with self.assertRaisesRegex(ValueError, 'Declared test cases did not execute:.*hidden'):
            self._inventory_source(source, report)

    def test_private_reserved_fields_methods_and_access_cannot_hide_tests(self):
        for word in ['default', 'new', 'extends', 'return', 'if']:
            for member, access in [(f'#{word}=8;', f'this.#{word}'),
                                   (f'#{word}(){{return 8;}}', f'this.#{word}()'),
                                   (f'get #{word}(){{return 8;}}', f'this.#{word}')]:
                with self.subTest(word=word, member=member):
                    source = ("import test from 'node:test'; class C {" + member +
                              'm(){const n=' + access +
                              " / 2; if(false) test('hidden',()=>{}); 1 / 2;}}" +
                              "new C().m(); test('visible',()=>{});")
                    self._reject_hidden(source)

    def test_ecmascript_whitespace_and_comments_preserve_property_context(self):
        # ECMAScript WhiteSpace (including BOM) and all four LineTerminators.
        separators = ['\t', '\v', '\f', ' ', '\u00a0', '\u1680',
                      *map(chr, range(0x2000, 0x200b)), '\u202f', '\u205f',
                      '\u3000', '\ufeff', '\n', '\r', '\u2028', '\u2029',
                      '/* property */', '/*\ufeff\u2028*/', '// property\u2029']
        for separator in separators:
            with self.subTest(separator=repr(separator)):
                source = ("import test from 'node:test';const object={default:8};const n=object." +
                          separator + "default / 2;if(false) test('hidden',()=>{});1 / 2;" +
                          "test('visible',()=>{});")
                self._reject_hidden(source)

    def test_ast_contexts_previously_rejected_are_complete(self):
        prefixes = ['{} /"/;', 'for (const x of []) /"/;',
                    'for await (const x of []) /"/;', 'const a=/[[a]]/v;',
                    'label: {break label;} /"/;',
                    'const object={return:8};const n=object./*x*/return / 2;',
                    'const object={default:8};const n=object.\\u0064efault / 2;',
                    'const π=8;const n=π / 2;',
                    'function f(){return\n /test(\'phantom\',x)/;}',
                    'const f=function(){} / 2;', 'class C{} /"/;']
        for prefix in prefixes:
            with self.subTest(prefix=prefix):
                self._reject_hidden("import test from 'node:test';" + prefix +
                                    "if(false) test('hidden',()=>{}); /\"/; test('visible',()=>{});")

    def test_parser_failures_never_yield_a_valid_prefix(self):
        for suffix in ['const x=;', 'class C{ m(){return this.#missing;} }',
                       'const x=/[a/;', 'const x=object.\u0085default;',
                       "test(('name' + suffix),()=>{});", "test(('name'.trim()),()=>{});", "test(('name').trim(),()=>{});",
                       "test((('name')).trim(),()=>{});", "test(lookup('name'),()=>{});", "new test('hidden',()=>{});"]:
            with self.subTest(suffix=suffix):
                iterator = test_names("test('valid prefix',()=>{});" + suffix)
                with self.assertRaises(ValueError):
                    next(iterator)

    def test_adapter_rejects_unavailable_runtime_bad_response_and_timeout(self):
        source = "test('unique adapter failure fixture',()=>{});"
        failures = [OSError('unavailable'), subprocess.TimeoutExpired('node', 10)]
        results = [subprocess.CompletedProcess([], 1, b'[]'),
                   subprocess.CompletedProcess([], 0, b'partial'),
                   subprocess.CompletedProcess([], 0, b'{"names":[]}'),
                   subprocess.CompletedProcess([], 0, b'[1]')]
        for result in [*failures, *results]:
            with self.subTest(result=type(result).__name__):
                inventory_source._parsed_names.cache_clear()
                kwargs = {'side_effect': result} if isinstance(result, Exception) else {'return_value': result}
                with patch.object(inventory_source.subprocess, 'run', **kwargs), self.assertRaises(ValueError):
                    next(test_names(source))
        inventory_source._parsed_names.cache_clear()

    def test_native_parser_and_runtime_versions_are_enforced(self):
        for setup, flags in [('', []),
                             ("Object.defineProperty(process,'version',{value:'v24.23.0'});", ['--expose-internals']),
                             ("require('node:internal/deps/acorn/acorn/dist/acorn').version='different';", ['--expose-internals'])]:
            with self.subTest(setup=setup):
                program = setup + 'require(' + json.dumps(str(inventory_source.PARSER)) + ');'
                result = subprocess.run(['node', *flags, '--max-old-space-size=64', '-e', program],
                                        input="test('valid',()=>{});", capture_output=True, text=True, timeout=10)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(result.stdout, '')
                self.assertEqual(result.stderr.strip(), 'JavaScript inventory parse failed')

    def test_source_size_and_parser_depth_fail_closed(self):
        with self.assertRaises(ValueError):
            next(test_names(' ' * (inventory_source.MAX_SOURCE_BYTES + 1)))
        with self.assertRaises(ValueError):
            next(test_names('// ' + 'ñ' * inventory_source.MAX_SOURCE_BYTES))
        # Bounded fixture, only the new parser, with heap/time limits in adapter.
        with self.assertRaises(ValueError):
            next(test_names('(' * 4096 + '1' + ')' * 4096))

    def test_literal_names_and_multiple_declarations(self):
        source = '''test('first: punctuation, spaces! (A/B)',()=>{});
          await t.test("second — ñ", async()=>{}); test ( 'third',()=>{});
          test('chained first',()=>{}).test('chained second',()=>{});'''
        self.assertEqual(list(test_names(source)), ['first: punctuation, spaces! (A/B)', 'second — ñ', 'third', 'chained first', 'chained second'])

    def test_escaped_quotes_keep_legacy_normalization(self):
        source = r'''test('single \' quote',()=>{});test("double \" quote",()=>{});
          test('backslash \\ and raw \n',()=>{});'''
        self.assertEqual(list(test_names(source)), ["single ' quote", 'double " quote', r'backslash \\ and raw \n'])

    def test_comments_strings_regexes_and_template_text_are_not_declarations(self):
        source = '''// test('line fake',()=>{});
          /* test("block fake",()=>{}); */
          const a="test('string fake',()=>{})", b='test("other fake",()=>{})';
          const r=/test\\('regex fake'\\)/, s=/["'/]/;
          const text=`test('template fake',()=>{})`;
          test/* between tokens */('real'/* after name */,()=>{});
          // comment ends at a JS line separator\u2028test('also real',()=>{});'''
        self.assertEqual(list(test_names(source)), ['real', 'also real'])

    def test_template_interpolations_cannot_hide_literal_declarations(self):
        source = '''const x=`raw ${ {value: `nested ${test('inside',()=>{})}`} } end`;
          test('outside',()=>{});'''
        self.assertEqual(list(test_names(source)), ['inside', 'outside'])

    def test_dynamic_names_remain_outside_the_static_contract(self):
        source = '''test('parent',async t=>{await t.test(`dynamic ${1}`,()=>{});
          await t.test(name,()=>{});await t.test('literal child',()=>{});
          await t.test(`dynamic ${test('nested literal',()=>{})}`,()=>{});});'''
        self.assertEqual(list(test_names(source)), ['parent', 'literal child', 'nested literal'])
        actual = Path('backend/test/contact-deadline.integration.test.js').read_text()
        names = list(test_names(actual))
        self.assertIn('P2-4 notification deadline survives delayed COMMIT on isolated PostgreSQL', names)
        self.assertTrue(all('${' not in name for name in names))

    def test_unterminated_or_composed_literal_names_fail_explicitly(self):
        for bad in ["test('unfinished", 'test("unfinished', "test('dangling\\",
                    "test('line\nbreak',()=>{})", "test('name'", "test('name')",
                    "test('name' + suffix,()=>{})", "test('name'.trim(),()=>{})"]:
            with self.subTest(source=bad), self.assertRaises(ValueError):
                list(test_names("test('valid prefix',()=>{});" + bad))

    def test_unterminated_lexical_regions_and_unsupported_ambiguities_fail_closed(self):
        for bad in ['/* unfinished', "const a='unfinished", 'const a=`unfinished',
                    'const a=`${1}', 'const a=/unfinished', 'const a=/[a/;',
                    'break label\n/"/.test(x);', 'const x=object.\u0085default / 2;']:
            with self.subTest(source=bad), self.assertRaises(ValueError):
                list(test_names("test('valid',()=>{});" + bad))

    def test_regex_expression_positions_and_division_preserve_later_names(self):
        source = '''if(ok()) /["']/.test(value); const n=Number(2)/1e6;
          const m=n++ / 2; const r=object.return / 2;
          test('visible',()=>{});'''
        self.assertIn('visible', list(test_names(source)))

    def test_current_corpus_and_pinned_catalog_are_readable(self):
        files = sorted(p for root in ['backend/test', 'frontend/test']
                       for p in Path(root).glob('*.js') if p.name.endswith(('.test.js', '.cases.js')))
        self.assertTrue(files)
        self.assertTrue(all(list(test_names(p.read_text())) for p in files))
        contract = json.loads(Path('scripts/ci/episode-cases.json').read_text())
        modules = [contract['module'], *contract.get('additionalModules', [])]
        declared = [name for module in modules for name in test_names(Path(module).read_text())]
        self.assertEqual(len(declared), len(set(declared)))
        self.assertEqual(set(declared), set(contract['cases']))

    def test_inventory_still_rejects_omission_mismatch_empty_and_malformed_sources(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cases.js'
            path.write_text("test('one',()=>{}); test(\"two\",()=>{});")
            report = parse_tap('ok 1 - one\nok 2 - two\n# tests 2\n# duration_ms 1')
            self.assertEqual(inventory(report, [path])['declaredCases'], ['one', 'two'])
            for names in [[], ['one'], ['different']]:
                with self.subTest(names=names), self.assertRaises(ValueError):
                    inventory({'tests': [{'name': n, 'status': 'passed'} for n in names]}, [path])
            path.write_text("test('one',()=>{});test('broken")
            with self.assertRaises(ValueError):
                inventory({'tests': [{'name': 'one', 'status': 'passed'}]}, [path])
            path.write_text('// only comments')
            with self.assertRaises(ValueError):
                inventory(report, [path])

    def test_ordinary_duplicate_names_keep_the_existing_set_contract(self):
        # Only pinned imported cases require uniqueness/exactly one passed TAP
        # entry. Ordinary declarations historically collapse to a set.
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'duplicates.js'
            path.write_text("test('same',()=>{});test('same',()=>{});")
            report = {'tests': [{'name': 'same', 'status': 'passed'}]}
            self.assertEqual(inventory(report, [path])['declaredCases'], ['same'])

    def test_bounded_repetitive_inputs_in_resource_limited_child(self):
        # Never run the vulnerable regex on adversarial input. Enforce a wall
        # timeout and CPU limit; each Node parse has its own heap/time limit.
        code = r'''
import resource,sys
resource.setrlimit(resource.RLIMIT_CPU,(4,4))
sys.path.insert(0,'scripts/ci')
from inventory_source import test_names
for size in [128,1024,8192]:
    label='\\a'*size
    assert list(test_names("test('"+label+"',()=>{});"))==[label]
    assert len(list(test_names("test('x',()=>{});"*size)))==size
    assert list(test_names("export default /test('phantom',x)/;"+"test('x',()=>{});"*size))==['x']*size
    for source in ["test('"+label, "test('"+label+"\\", '/*'+label, '`'+label]:
        try:list(test_names(source))
        except ValueError:pass
        else:raise AssertionError('Malformed source accepted')
print('bounded repetitive inputs passed')
'''
        result = subprocess.run([sys.executable, '-B', '-c', code], capture_output=True, text=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'bounded repetitive inputs passed')

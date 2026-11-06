import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from common import inventory, parse_tap
from inventory_source import test_names


class InventorySource(unittest.TestCase):
    def test_literal_names_and_multiple_declarations(self):
        source = '''test('first: punctuation, spaces! (A/B)',()=>{});
          await t.test("second — ñ", async()=>{}); test ( 'third',()=>{});'''
        self.assertEqual(list(test_names(source)), ['first: punctuation, spaces! (A/B)', 'second — ñ', 'third'])

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
          await t.test(name,()=>{});await t.test('literal child',()=>{});});'''
        self.assertEqual(list(test_names(source)), ['parent', 'literal child'])
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
                    'const a=`${1}', 'const a=/unfinished', 'const a=/[[a]]/v;',
                    '{} /"/.test(x);', 'for (const x of /a/) {}',
                    'for await (const x of xs) /"/.test(x);', 'break label\n/"/.test(x);']:
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
        # timeout as well as CPU/address-space limits on this new extractor.
        code = r'''
import resource,sys
resource.setrlimit(resource.RLIMIT_CPU,(2,2))
resource.setrlimit(resource.RLIMIT_AS,(128*1024*1024,128*1024*1024))
sys.path.insert(0,'scripts/ci')
from inventory_source import test_names
for size in [128,1024,8192]:
    label='\\a'*size
    assert list(test_names("test('"+label+"',()=>{});"))==[label]
    assert len(list(test_names("test('x',()=>{});"*size)))==size
    for source in ["test('"+label, "test('"+label+"\\", '/*'+label, '`'+label]:
        try:list(test_names(source))
        except ValueError:pass
        else:raise AssertionError('Malformed source accepted')
print('bounded repetitive inputs passed')
'''
        result = subprocess.run([sys.executable, '-B', '-c', code], capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), 'bounded repetitive inputs passed')

import base64
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sign_android', pathlib.Path(__file__).resolve().parents[1] / 'sign-android.py')
signing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(signing)


class SigningTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.apk = self.root / 'src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk'
        self.apk.parent.mkdir(parents=True)
        self.apk.write_bytes(b'unsigned fixture')
        (self.root / 'src-tauri/tauri.conf.json').write_text(json.dumps({'version': '1.2.3'}))
        self.env = {
            'ANDROID_HOME': '/sdk',
            'ANDROID_KEYSTORE_BASE64': base64.b64encode(b'keystore fixture').decode(),
            'ANDROID_KEYSTORE_PASSWORD': 'store-secret',
            'ANDROID_KEY_ALIAS': 'sloy',
            'ANDROID_KEY_PASSWORD': 'key-secret',
        }

    def test_align_sign_verify_and_remove_key(self):
        self.env['ANDROID_KEYSTORE_BASE64'] += '\n'
        key_paths = []

        def run(args, **kwargs):
            if 'sign' in args:
                key = pathlib.Path(args[args.index('--ks') + 1])
                key_paths.append(key)
                self.assertEqual(key.read_bytes(), b'keystore fixture')
                self.assertEqual(key.stat().st_mode & 0o777, 0o600)
                self.assertNotIn('store-secret', args)
                self.assertNotIn('key-secret', args)
                self.assertIn('env:ANDROID_KEYSTORE_PASSWORD', args)
                self.assertIn('env:ANDROID_KEY_PASSWORD', args)
            self.assertTrue(kwargs['check'])

        with patch.object(signing.subprocess, 'run', side_effect=run) as mocked:
            output = signing.sign(self.root, self.env)
        self.assertEqual(output.name, 'Sloy-1.2.3-android-arm64.apk')
        self.assertEqual(mocked.call_count, 4)
        self.assertFalse(key_paths[0].exists())
        self.assertEqual(mocked.call_args_list[2].args[0][1], 'verify')

    def test_missing_secrets_and_bad_base64_fail_before_tools_run(self):
        with patch.object(signing.subprocess, 'run') as mocked:
            for name in signing.SECRETS:
                env = dict(self.env, **{name: ''})
                with self.assertRaisesRegex(ValueError, name):
                    signing.sign(self.root, env)
            for text in ['bad!', '   ']:
                with self.assertRaises(ValueError):
                    signing.sign(self.root, dict(self.env, ANDROID_KEYSTORE_BASE64=text))
            mocked.assert_not_called()

    def test_rejects_missing_or_ambiguous_apks(self):
        self.apk.unlink()
        with self.assertRaisesRegex(ValueError, 'found 0'):
            signing.sign(self.root, self.env)
        self.apk.write_bytes(b'one')
        self.apk.with_name('second-release-unsigned.apk').write_bytes(b'two')
        with self.assertRaisesRegex(ValueError, 'found 2'):
            signing.sign(self.root, self.env)

    def test_key_is_removed_when_signing_fails(self):
        keys = []

        def run(args, **kwargs):
            if 'sign' in args:
                keys.append(pathlib.Path(args[args.index('--ks') + 1]))
                raise signing.subprocess.CalledProcessError(1, args)

        with patch.object(signing.subprocess, 'run', side_effect=run):
            with self.assertRaises(signing.subprocess.CalledProcessError):
                signing.sign(self.root, self.env)
        self.assertFalse(keys[0].exists())

"""Align and sign an ARM64 release APK using secrets supplied by the release job."""
import base64
import json
import os
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
SECRETS = ('ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD',
           'ANDROID_KEY_ALIAS', 'ANDROID_KEY_PASSWORD')


def sign(root=ROOT, env=None):
    env = dict(os.environ if env is None else env)
    for name in SECRETS:
        if not env.get(name):
            raise ValueError(f'Missing release secret: {name}')
    try:
        key_data = base64.b64decode(''.join(env['ANDROID_KEYSTORE_BASE64'].split()), validate=True)
    except ValueError:
        raise ValueError('ANDROID_KEYSTORE_BASE64 is not valid Base64') from None
    if not key_data:
        raise ValueError('Keystore is empty')
    apks = list((root / 'src-tauri/gen/android/app/build/outputs/apk').rglob('*release-unsigned.apk'))
    if len(apks) != 1:
        raise ValueError(f'Expected one unsigned release APK, found {len(apks)}')
    tools = pathlib.Path(env['ANDROID_HOME']) / 'build-tools/36.0.0'
    version = json.loads((root / 'src-tauri/tauri.conf.json').read_text())['version']
    output = root / f'release/Sloy-{version}-android-arm64.apk'
    output.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='sloy-signing-') as tmp:
        key = pathlib.Path(tmp) / 'release.jks'
        key.write_bytes(key_data)
        key.chmod(0o600)
        aligned = pathlib.Path(tmp) / 'aligned.apk'
        subprocess.run([str(tools / 'zipalign'), '-P', '16', '-f', '4', str(apks[0]), str(aligned)], check=True, env=env)
        subprocess.run([str(tools / 'apksigner'), 'sign', '--ks', str(key),
                        '--ks-key-alias', env['ANDROID_KEY_ALIAS'],
                        '--ks-pass', 'env:ANDROID_KEYSTORE_PASSWORD',
                        '--key-pass', 'env:ANDROID_KEY_PASSWORD',
                        '--out', str(output), str(aligned)], check=True, env=env)
    subprocess.run([str(tools / 'apksigner'), 'verify', str(output)], check=True, env=env)
    subprocess.run([str(tools / 'zipalign'), '-c', '-P', '16', '4', str(output)], check=True, env=env)
    print(f'Signed and verified {output.name}')
    return output


if __name__ == '__main__':
    sign()

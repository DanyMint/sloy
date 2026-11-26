"""Verify launcher references and density variants in a built Android APK."""
import argparse
import os
import re
import struct
import subprocess
from pathlib import Path
from zipfile import ZipFile


def check_icons(aapt2, apk):
    def dump(*args):
        return subprocess.check_output([aapt2, 'dump', *args, apk], text=True)

    table = dump('resources')
    entries = re.split(r'^    resource (0x[0-9a-f]+) (\S+)[^\n]*\n', table, flags=re.M)
    resources = {name: (resource_id, values)
                 for resource_id, name, values in zip(entries[1::3], entries[2::3], entries[3::3])}

    def check_reference(xml, element, attribute, resource):
        node = re.search(rf'^ *E: {element} \([^\n]*\)\n((?: *A: [^\n]*\n)*)', xml, re.M)
        resource_id = resources[resource][0]
        pattern = rf'http://schemas.android.com/apk/res/android:{attribute}\(0x[0-9a-f]+\)=@{resource_id}$'
        if not node or not re.search(pattern, node[1], re.M):
            raise ValueError(f'<{element}> android:{attribute} must reference {resource}')

    def resource_file(resource, density, kind):
        values = resources[resource][1]
        match = re.search(rf'^ +\({density}\) \(file\) (\S+) type={kind}$', values, re.M)
        if not match:
            raise ValueError(f'{resource} has no {kind} for {density}')
        return match[1]

    manifest = dump('xmltree', '--file', 'AndroidManifest.xml')
    launchers = {'icon': 'mipmap/ic_launcher', 'roundIcon': 'mipmap/ic_launcher_round'}
    foreground = 'mipmap/ic_launcher_foreground'
    background = 'color/ic_launcher_background'
    with ZipFile(apk) as archive:
        for attribute, resource in launchers.items():
            check_reference(manifest, 'application', attribute, resource)
            path = resource_file(resource, 'anydpi', 'XML')
            if not path.startswith('res/mipmap-anydpi-v26/'):
                raise ValueError(f'{resource} has no API 26 adaptive icon')
            adaptive = dump('xmltree', '--file', path)
            if not re.search(r'^ *E: adaptive-icon ', adaptive, re.M):
                raise ValueError(f'{path} must contain an adaptive icon')
            check_reference(adaptive, 'foreground', 'drawable', foreground)
            check_reference(adaptive, 'background', 'drawable', background)

        densities = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}
        for resource in (*launchers.values(), foreground):
            dp = 108 if resource == foreground else 48
            for density, scale in densities.items():
                path = resource_file(resource, density, 'PNG')
                with archive.open(path) as png:
                    header = png.read(24)
                size = int(dp * scale)
                if header[:16] != b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR' or header[16:] != struct.pack('>II', size, size):
                    raise ValueError(f'{path} must be a {size}x{size} PNG')
    print(f'{apk}: manifest launcher references, both adaptive icons and 15 density PNGs verified')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('apk', type=Path)
    args = parser.parse_args()
    tools = Path(os.environ['ANDROID_HOME']) / 'build-tools/36.0.0'
    try:
        check_icons(tools / 'aapt2', args.apk)
    except (KeyError, ValueError, OSError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'{args.apk}: {error}\n')

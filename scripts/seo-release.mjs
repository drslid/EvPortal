/* Fingerprint public output without timestamps, Git history or local user data. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function releaseFingerprint(root, pages) {
    const files = new Map(pages);
    function addAssets(directory) {
        if (!fs.existsSync(path.join(root, directory))) return;
        for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
            const name = directory + '/' + entry.name;
            if (entry.isDirectory()) {
                if (name !== 'js/locales') addAssets(name);
            } else if (entry.isFile() && /\.(?:js|css|png|webp|svg|ico|gif|jpg|jpeg|woff2?|xml|json)$/.test(name)) {
                files.set(name, fs.readFileSync(path.join(root, name)));
            }
        }
    }
    for (const directory of ['js', 'css', 'img']) addAssets(directory);
    const fingerprint = createHash('sha256');
    for (const [name, value] of [...files].sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0)) {
        fingerprint.update(name + '\0');
        fingerprint.update(createHash('sha256').update(value).digest());
    }
    return fingerprint.digest('hex');
}

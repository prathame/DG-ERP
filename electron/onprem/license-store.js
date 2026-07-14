/**
 * Encrypted local storage for license key and cached activation data.
 * Uses the machine's CPU serial + app ID as encryption key — no hardcoded secret.
 */
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
const STORE_FILE = path.join(app.getPath('userData'), 'license.dat');
function machineSecret() {
    // Stable per-machine key derived from hostname + platform + username
    return crypto.createHash('sha256')
        .update(`DG-ERP-${os.hostname()}-${os.platform()}-${os.userInfo().username}`)
        .digest('hex').slice(0, 32);
}
function encrypt(text) {
    const key = Buffer.from(machineSecret(), 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}
function decrypt(data) {
    const [ivHex, encHex] = data.split(':');
    const key = Buffer.from(machineSecret(), 'hex');
    const iv = Buffer.from(ivHex, 'hex');
    const enc = Buffer.from(encHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
}
export function saveLicense(data) {
    fs.writeFileSync(STORE_FILE, encrypt(JSON.stringify(data)), 'utf8');
}
export function loadLicense() {
    try {
        if (!fs.existsSync(STORE_FILE))
            return null;
        const raw = fs.readFileSync(STORE_FILE, 'utf8');
        return JSON.parse(decrypt(raw));
    }
    catch {
        return null;
    }
}
export function clearLicense() {
    if (fs.existsSync(STORE_FILE))
        fs.unlinkSync(STORE_FILE);
}
export function getMachineId() {
    return crypto.createHash('sha256')
        .update(`${os.hostname()}-${os.platform()}-${os.cpus()[0]?.model || 'cpu'}`)
        .digest('hex').slice(0, 32);
}

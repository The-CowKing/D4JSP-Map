"""Recursive SFTP deploy of dist/ to /opt/d4jsp-map/dist/ on KVM 4.
Atomic per-file replace with .bak.<unix-ts>. Single-shot, no polling.
"""
import os, sys, time, posixpath, stat
import paramiko

LOCAL = r'C:\Users\Owner\D4JSP-Map\dist'
REMOTE = '/opt/d4jsp-map/dist'
HOST = '177.7.32.128'
USER = 'root'
KEY  = r'C:\Users\Owner\Desktop\keyz\d4jsp_kvm4_claude'
TS = str(int(time.time()))

key = paramiko.Ed25519Key.from_private_key_file(KEY) if os.path.exists(KEY) else None
if key is None:
    # try RSA
    key = paramiko.RSAKey.from_private_key_file(KEY)

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, pkey=key, timeout=15)
sftp = ssh.open_sftp()

def ensure_remote_dir(path):
    parts = path.strip('/').split('/')
    cur = ''
    for p in parts:
        cur += '/' + p
        try:
            sftp.stat(cur)
        except FileNotFoundError:
            sftp.mkdir(cur)

def remote_exists(p):
    try:
        sftp.stat(p)
        return True
    except FileNotFoundError:
        return False

ensure_remote_dir(REMOTE)

uploaded = []
backed_up = []

# Walk LOCAL, mirror to REMOTE.
for root, dirs, files in os.walk(LOCAL):
    rel = os.path.relpath(root, LOCAL).replace('\\', '/')
    if rel == '.':
        rel = ''
    rdir = posixpath.join(REMOTE, rel) if rel else REMOTE
    ensure_remote_dir(rdir)
    for f in files:
        lpath = os.path.join(root, f)
        rpath = posixpath.join(rdir, f)
        # Backup existing
        if remote_exists(rpath):
            bpath = rpath + f'.bak.{TS}'
            try:
                sftp.posix_rename(rpath, bpath)
                backed_up.append(bpath)
            except Exception:
                # fallback to non-atomic rename
                try:
                    sftp.rename(rpath, bpath)
                    backed_up.append(bpath)
                except Exception as e:
                    print(f'WARN: backup failed for {rpath}: {e}', file=sys.stderr)
        # Upload to .new then rename (atomic per file)
        tpath = rpath + '.new'
        sftp.put(lpath, tpath)
        try:
            sftp.posix_rename(tpath, rpath)
        except Exception:
            sftp.rename(tpath, rpath)
        uploaded.append(rpath)

print(f'UPLOADED: {len(uploaded)}')
for u in uploaded:
    print('  +', u)
print(f'BACKED_UP: {len(backed_up)}')

sftp.close()
ssh.close()
print('DEPLOY_OK ts=' + TS)

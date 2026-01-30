import { execSync } from 'child_process';

export function syncToRemote(localDir: string, sshHost: string, sshDestDir: string) {
  console.log(`\nSyncing to ${sshHost}:${sshDestDir}...`);
  try {
    execSync(`rsync -avz ${localDir}/ ${sshHost}:${sshDestDir}/`, { stdio: 'inherit' });
    console.log('Sync complete.');
  } catch (error) {
    console.error('Rsync failed:', error);
  }
}

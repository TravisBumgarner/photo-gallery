import { execSync } from 'node:child_process';

export function syncToRemote(
  localDir: string,
  sshHost: string,
  sshDestDir: string,
) {
  console.log(`\nSyncing to ${sshHost}:${sshDestDir}...`);
  try {
    execSync(`ssh ${sshHost} "mkdir -p ${sshDestDir}"`, { stdio: 'inherit' });
    execSync(`rsync -avz ${localDir}/ ${sshHost}:${sshDestDir}/`, {
      stdio: 'inherit',
    });
    console.log('Sync complete.');
  } catch (error) {
    console.error('Rsync failed:', error);
  }
}

export function syncFileFromRemote(
  sshHost: string,
  remotePath: string,
  localPath: string,
) {
  console.log(`\nPulling ${sshHost}:${remotePath}...`);
  try {
    execSync(`rsync -avz ${sshHost}:${remotePath} ${localPath}`, {
      stdio: 'inherit',
    });
    console.log('Pull complete.');
  } catch (error) {
    console.error('Rsync pull failed:', error);
  }
}

export function syncFileToRemote(
  localPath: string,
  sshHost: string,
  remotePath: string,
) {
  console.log(`\nPushing to ${sshHost}:${remotePath}...`);
  try {
    execSync(`rsync -avz ${localPath} ${sshHost}:${remotePath}`, {
      stdio: 'inherit',
    });
    console.log('Push complete.');
  } catch (error) {
    console.error('Rsync push failed:', error);
  }
}

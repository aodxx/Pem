'use strict';

// Operational backup helpers for PALM LEDGER.
// These functions are intentionally isolated from Code.gs so production backup
// can be maintained without touching the core API bundle.
const BACKUP_CONFIG = Object.freeze({
  folderName: 'Backups',
  filePrefix: 'PALM_LEDGER_BACKUP_',
  retentionCount: 30,
  triggerFunction: 'createDataBackup'
});

/**
 * Create a point-in-time copy of the owner's Spreadsheet inside the owner's
 * Drive workspace. Receipt images are not duplicated; their Drive file IDs
 * remain referenced by the copied Spreadsheet.
 */
function createDataBackup() {
  const runtime = getRuntimeConfig_();
  if (!runtime.spreadsheetId) throw new AppError('BACKUP_CONFIG_MISSING', 'ไม่พบ Spreadsheet สำหรับสำรองข้อมูล');
  if (!runtime.projectFolderId) throw new AppError('BACKUP_CONFIG_MISSING', 'ไม่พบโฟลเดอร์โครงการสำหรับสำรองข้อมูล');

  const projectFolder = DriveApp.getFolderById(runtime.projectFolderId);
  const backupFolder = getOrCreateBackupFolder_(projectFolder);
  const spreadsheetFile = DriveApp.getFileById(runtime.spreadsheetId);
  const stamp = Utilities.formatDate(new Date(), runtime.timeZone || 'Asia/Bangkok', 'yyyyMMdd_HHmmss');
  const copy = spreadsheetFile.makeCopy(BACKUP_CONFIG.filePrefix + stamp, backupFolder);
  const createdAt = new Date().toISOString();

  pruneOldBackups_(backupFolder);
  PropertiesService.getScriptProperties().setProperties({
    LAST_BACKUP_FILE_ID: copy.getId(),
    LAST_BACKUP_AT: createdAt
  }, false);

  return {
    ok: true,
    backupFileId: copy.getId(),
    backupName: copy.getName(),
    createdAt: createdAt
  };
}

/** Install exactly one daily backup trigger. Safe to run repeatedly. */
function installDailyBackupTrigger() {
  const existing = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_CONFIG.triggerFunction;
  });

  if (!existing.length) {
    ScriptApp.newTrigger(BACKUP_CONFIG.triggerFunction)
      .timeBased()
      .everyDays(1)
      .atHour(2)
      .create();
  }

  return {
    ok: true,
    triggerInstalled: true,
    existingCount: existing.length,
    schedule: 'daily around 02:00 project time zone'
  };
}

/** Return non-secret backup status for troubleshooting. */
function getBackupStatus() {
  const props = PropertiesService.getScriptProperties();
  const triggerCount = ScriptApp.getProjectTriggers().filter(function(trigger) {
    return trigger.getHandlerFunction() === BACKUP_CONFIG.triggerFunction;
  }).length;

  return {
    ok: true,
    triggerInstalled: triggerCount > 0,
    triggerCount: triggerCount,
    lastBackupFileId: props.getProperty('LAST_BACKUP_FILE_ID') || '',
    lastBackupAt: props.getProperty('LAST_BACKUP_AT') || '',
    retentionCount: BACKUP_CONFIG.retentionCount
  };
}

/**
 * Safe recovery helper. It creates a NEW review copy from a backup and never
 * overwrites the live production Spreadsheet automatically.
 */
function createRestoreCopyFromBackup(backupFileId) {
  const cleanId = String(backupFileId || '').trim();
  if (!cleanId) throw new AppError('BACKUP_ID_REQUIRED', 'กรุณาระบุ Backup File ID');

  const runtime = getRuntimeConfig_();
  if (!runtime.projectFolderId) throw new AppError('BACKUP_CONFIG_MISSING', 'ไม่พบโฟลเดอร์โครงการ');

  const source = DriveApp.getFileById(cleanId);
  if (source.getMimeType() !== MimeType.GOOGLE_SHEETS) {
    throw new AppError('INVALID_BACKUP_FILE', 'ไฟล์สำรองต้องเป็น Google Sheets');
  }

  const projectFolder = DriveApp.getFolderById(runtime.projectFolderId);
  const stamp = Utilities.formatDate(new Date(), runtime.timeZone || 'Asia/Bangkok', 'yyyyMMdd_HHmmss');
  const restored = source.makeCopy('PALM_LEDGER_RESTORE_REVIEW_' + stamp, projectFolder);

  return {
    ok: true,
    restoredFileId: restored.getId(),
    restoredName: restored.getName(),
    message: 'สร้างสำเนาสำหรับตรวจสอบแล้ว โดยยังไม่แตะข้อมูล production'
  };
}

function getOrCreateBackupFolder_(projectFolder) {
  const folders = projectFolder.getFoldersByName(BACKUP_CONFIG.folderName);
  return folders.hasNext() ? folders.next() : projectFolder.createFolder(BACKUP_CONFIG.folderName);
}

function pruneOldBackups_(backupFolder) {
  const files = [];
  const iterator = backupFolder.getFiles();
  while (iterator.hasNext()) {
    const file = iterator.next();
    if (file.getName().indexOf(BACKUP_CONFIG.filePrefix) === 0) files.push(file);
  }

  files.sort(function(a, b) {
    return b.getDateCreated().getTime() - a.getDateCreated().getTime();
  });

  files.slice(BACKUP_CONFIG.retentionCount).forEach(function(file) {
    file.setTrashed(true);
  });
}

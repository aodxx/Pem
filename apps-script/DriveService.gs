function ensureReceiptsFolder_() {
  const properties = PropertiesService.getScriptProperties();
  const existingId = properties.getProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId);
  if (existingId) {
    try {
      return DriveApp.getFolderById(existingId);
    } catch (error) {
      properties.deleteProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId);
    }
  }

  const config = getRuntimeConfig_();
  if (!config.projectFolderId) {
    throw new AppError('NOT_CONFIGURED', 'ยังไม่ได้กำหนด Project Folder ID');
  }

  const projectFolder = DriveApp.getFolderById(config.projectFolderId);
  const matches = projectFolder.getFoldersByName(APP_CONFIG.receiptsFolderName);
  const receiptsFolder = matches.hasNext()
    ? matches.next()
    : projectFolder.createFolder(APP_CONFIG.receiptsFolderName);

  properties.setProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId, receiptsFolder.getId());
  return receiptsFolder;
}

function ensureMonthlyReceiptFolder_(date) {
  const target = date || new Date();
  const root = ensureReceiptsFolder_();
  const yearName = Utilities.formatDate(target, APP_CONFIG.timeZone, 'yyyy');
  const monthName = Utilities.formatDate(target, APP_CONFIG.timeZone, 'MM');
  const yearFolder = getOrCreateChildFolder_(root, yearName);
  return getOrCreateChildFolder_(yearFolder, monthName);
}

function getOrCreateChildFolder_(parent, name) {
  const iterator = parent.getFoldersByName(name);
  return iterator.hasNext() ? iterator.next() : parent.createFolder(name);
}

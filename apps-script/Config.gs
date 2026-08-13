const APP_CONFIG = Object.freeze({
  appName: 'Palm Yield Ledger',
  serviceName: 'palm-yield-ledger-api',
  version: '0.2.0',
  apiVersion: 'v1',
  timeZone: 'Asia/Bangkok',
  spreadsheetId: '1S5WtdhsVUOQ5APZ_EiBKSZBTeyi6VKnVLeaGbWPBAPc',
  projectFolderId: '1AnRqXRhfecY1-qqM3iQlV1YtR945cDoN',
  receiptsFolderName: 'Palm Yield Ledger Receipts',
  settingsSheet: 'Settings',
  logSheet: 'Logs',
  requiredSheets: Object.freeze({
    Sales: Object.freeze([
      'SaleID', 'RecordStatus', 'ReceiptNumber', 'SaleDate', 'TimeIn', 'TimeOut',
      'BuyerID', 'BuyerNameRaw', 'BranchRaw', 'CustomerCode', 'CustomerName',
      'VehiclePlate', 'ProductCode', 'ProductName', 'GrossWeightKg', 'TareWeightKg',
      'NetWeightKg', 'DeductionWeightKg', 'PayableWeightKg', 'PricePerKg',
      'GrossAmount', 'TotalDeduction', 'NetAmount', 'Currency', 'Notes',
      'HandwrittenNotes', 'ImageFileID', 'ImageName', 'ImageSha256', 'ImageMimeType',
      'ImageBytes', 'OCRRunID', 'OCRStatus', 'ConfidenceOverall', 'AIModel', 'Source',
      'DuplicateScore', 'DuplicateOfSaleID', 'DuplicateOverride', 'CreatedAt', 'UpdatedAt'
    ]),
    Deductions: Object.freeze([
      'DeductionID', 'SaleID', 'SortOrder', 'DeductionType', 'Description', 'Quantity',
      'Unit', 'Rate', 'Amount', 'CreatedAt', 'UpdatedAt'
    ]),
    Buyers: Object.freeze([
      'BuyerID', 'BuyerName', 'NormalizedName', 'Branch', 'Address', 'Phone', 'Notes',
      'Active', 'CreatedAt', 'UpdatedAt'
    ]),
    OCRRuns: Object.freeze([
      'OCRRunID', 'RequestID', 'ImageSha256', 'Model', 'SchemaVersion', 'Status',
      'OverallConfidence', 'MissingFieldsJSON', 'WarningsJSON', 'ExtractedJSON',
      'DurationMs', 'ErrorCode', 'CreatedAt'
    ]),
    AuditTrail: Object.freeze([
      'AuditID', 'SaleID', 'Action', 'ChangedFieldsJSON', 'Actor', 'Timestamp', 'RequestID'
    ]),
    Logs: Object.freeze([
      'LogID', 'RequestID', 'Level', 'Action', 'SaleID', 'Description', 'ErrorCode',
      'DurationMs', 'Timestamp'
    ]),
    Settings: Object.freeze(['Key', 'Value', 'Type', 'Description'])
  })
});

const SCRIPT_PROPERTY_KEYS = Object.freeze({
  spreadsheetId: 'SPREADSHEET_ID',
  projectFolderId: 'PROJECT_FOLDER_ID',
  receiptsFolderId: 'RECEIPTS_FOLDER_ID',
  geminiApiKey: 'GEMINI_API_KEY',
  setupVersion: 'SETUP_VERSION',
  setupAt: 'SETUP_AT'
});

function getRuntimeConfig_() {
  const properties = PropertiesService.getScriptProperties();
  return {
    appName: APP_CONFIG.appName,
    serviceName: APP_CONFIG.serviceName,
    version: APP_CONFIG.version,
    apiVersion: APP_CONFIG.apiVersion,
    timeZone: APP_CONFIG.timeZone,
    spreadsheetId: properties.getProperty(SCRIPT_PROPERTY_KEYS.spreadsheetId) || APP_CONFIG.spreadsheetId,
    projectFolderId: properties.getProperty(SCRIPT_PROPERTY_KEYS.projectFolderId) || APP_CONFIG.projectFolderId,
    receiptsFolderId: properties.getProperty(SCRIPT_PROPERTY_KEYS.receiptsFolderId),
    geminiConfigured: Boolean(properties.getProperty(SCRIPT_PROPERTY_KEYS.geminiApiKey)),
    setupVersion: properties.getProperty(SCRIPT_PROPERTY_KEYS.setupVersion),
    setupAt: properties.getProperty(SCRIPT_PROPERTY_KEYS.setupAt)
  };
}

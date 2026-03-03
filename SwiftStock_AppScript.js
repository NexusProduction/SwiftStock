// ╔══════════════════════════════════════════════════════════════╗
// ║         SWIFTSTOCK — Google Sheets Sync Script              ║
// ║  Paste this ENTIRE file into your Apps Script editor        ║
// ║  Then: Deploy → New Deployment → Web App → Anyone          ║
// ╚══════════════════════════════════════════════════════════════╝

// ── YOUR GOOGLE SHEET ID ──
// From your sheet URL: /spreadsheets/d/THIS_PART/edit
const SPREADSHEET_ID = "18B3q80GIWgODy-E4AiJMReRG4Od6TlKuxUitMUGtPBA";

// ── MASTER SHEET NAMES (global, not per-company) ──
const MASTER_COMPANIES  = "📋 All Companies";
const MASTER_USERS      = "👥 All Users";
const MASTER_LOG        = "📜 Activity Log";

// ════════════════════════════════════════════════════════════════
//  ENTRY POINT — receives POST from your HTML pages
// ════════════════════════════════════════════════════════════════
function doPost(e) {
  try {
    const raw  = e.postData ? e.postData.contents : "{}";
    const data = JSON.parse(raw);
    const action = data.action || "";

    switch (action) {
      // ── Auth / Account ──
      case "createOwner":     return createOwner(data);
      case "createStaff":     return createStaff(data);
      case "deleteStaff":     return deleteStaff(data);
      case "updateProfile":   return updateProfile(data);

      // ── Godowns ──
      case "createGodown":    return createGodown(data);
      case "deleteGodown":    return deleteGodown(data);

      // ── Products ──
      case "createProduct":   return createProduct(data);
      case "updateProduct":   return updateProduct(data);
      case "deleteProduct":   return deleteProduct(data);

      // ── Entries (IN / OUT) ──
      case "addEntry":        return addEntry(data);

      // ── Notifications ──
      case "addNotification": return addNotification(data);

      default:
        return jsonResponse({ status: "error", message: "Unknown action: " + action });
    }
  } catch (err) {
    logError("doPost", err);
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// Allow CORS preflight
function doGet(e) {
  return jsonResponse({ status: "ok", service: "SwiftStock Sync", version: "2.0" });
}

// ════════════════════════════════════════════════════════════════
//  OWNER SIGNUP
//  Creates: master row + company-specific sheet with all tabs
// ════════════════════════════════════════════════════════════════
function createOwner(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureMasterSheets(ss);

  const now = formatDate(new Date());

  // 1. Write to master "All Companies" sheet
  const compSheet = ss.getSheetByName(MASTER_COMPANIES);
  compSheet.appendRow([
    now,
    data.companyName   || "",
    data.corporateId   || "",
    data.name          || "",
    data.email         || "",
    data.uid           || "",
    "Active"
  ]);
  styleLastRow(compSheet, "#0a2e1a");

  // 2. Write to master "All Users" sheet
  const userSheet = ss.getSheetByName(MASTER_USERS);
  userSheet.appendRow([
    now,
    data.companyName   || "",
    data.corporateId   || "",
    data.name          || "",
    data.email         || "",
    "Owner",
    data.uid           || "",
    "Active"
  ]);
  styleLastRow(userSheet, "#0a2e1a");

  // 3. Create a COMPANY-SPECIFIC sheet set
  createCompanySheets(ss, data);

  // 4. Log
  appendLog(ss, now, data.companyName, data.name, "Owner Signup", `Corporate ID: ${data.corporateId}`);

  return jsonResponse({ status: "ok", message: "Owner created in Sheets" });
}

// ════════════════════════════════════════════════════════════════
//  STAFF CREATION
// ════════════════════════════════════════════════════════════════
function createStaff(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ensureMasterSheets(ss);
  const now = formatDate(new Date());

  // Master Users sheet
  const userSheet = ss.getSheetByName(MASTER_USERS);
  userSheet.appendRow([
    now,
    data.companyName     || "",
    data.corporateId     || "",
    data.name            || "",
    data.email           || "",
    capitalize(data.role || "employee"),
    data.uid             || "",
    "Active"
  ]);
  styleLastRow(userSheet, getRoleColor(data.role));

  // Company-specific Staff sheet
  const staffSheetName = `[${data.companyName}] Staff`;
  let staffSheet = ss.getSheetByName(staffSheetName);
  if (!staffSheet) staffSheet = createCompanyStaffSheet(ss, data.companyName);
  staffSheet.appendRow([
    now,
    data.name          || "",
    data.corporateId   || "",
    capitalize(data.role || "employee"),
    data.email         || "",
    data.uid           || "",
    data.createdBy     || "",
    "Active"
  ]);
  styleLastRow(staffSheet, getRoleColor(data.role));

  appendLog(ss, now, data.companyName, data.createdByName || data.createdBy, "Staff Added",
    `${data.name} (${capitalize(data.role)}) — ID: ${data.corporateId}`);

  return jsonResponse({ status: "ok", message: "Staff synced to Sheets" });
}

// ════════════════════════════════════════════════════════════════
//  DELETE STAFF
// ════════════════════════════════════════════════════════════════
function deleteStaff(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());

  // Mark as removed in master Users sheet
  markRowStatus(ss, MASTER_USERS, data.uid, 7, "Removed");  // col 7 = uid, col 8 = status

  // Mark in company Staff sheet
  const staffSheetName = `[${data.companyName}] Staff`;
  const staffSheet = ss.getSheetByName(staffSheetName);
  if (staffSheet) markRowStatus(staffSheet, null, data.uid, 5, "Removed"); // col 6 = uid

  appendLog(ss, now, data.companyName, data.removedBy || "", "Staff Removed",
    `${data.name} (${data.corporateId}) removed`);

  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  UPDATE PROFILE
// ════════════════════════════════════════════════════════════════
function updateProfile(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());

  // Update in master Users sheet — find row by uid (col 7)
  const userSheet = ss.getSheetByName(MASTER_USERS);
  if (userSheet) {
    const vals = userSheet.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][6] === data.uid) {
        if (data.field === "name")  userSheet.getRange(i + 1, 4).setValue(data.newValue);
        if (data.field === "email") userSheet.getRange(i + 1, 5).setValue(data.newValue);
        break;
      }
    }
  }

  appendLog(ss, now, data.companyName, data.changedBy, "Profile Updated",
    `${data.name} changed ${data.field}`);

  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  CREATE GODOWN
// ════════════════════════════════════════════════════════════════
function createGodown(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());

  // Company godowns sheet
  const sheetName = `[${data.companyName}] Godowns`;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = createCompanyGodownsSheet(ss, data.companyName);

  sheet.appendRow([
    now,
    data.godownId     || "",
    data.name         || "",
    data.location     || "",
    data.customStaff ? "Custom" : "All Staff",
    (data.staffNames  || []).join(", "),
    data.createdByName || "",
    "Active"
  ]);
  styleLastRow(sheet, "#0a2432");

  appendLog(ss, now, data.companyName, data.createdByName, "Godown Created",
    `"${data.name}" at ${data.location}`);

  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  DELETE GODOWN
// ════════════════════════════════════════════════════════════════
function deleteGodown(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());
  const sheetName = `[${data.companyName}] Godowns`;
  const sheet = ss.getSheetByName(sheetName);
  if (sheet) markRowStatus(sheet, null, data.godownId, 1, "Deleted"); // col 2 = godownId

  appendLog(ss, now, data.companyName, data.deletedBy, "Godown Deleted", `"${data.name}"`);
  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  CREATE PRODUCT
// ════════════════════════════════════════════════════════════════
function createProduct(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());

  const sheetName = `[${data.companyName}] Products`;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = createCompanyProductsSheet(ss, data.companyName);

  const conversions = (data.conversions || []).map(c => `1 ${data.unit} = ${c.qty} ${c.unit}`).join(" | ");

  sheet.appendRow([
    now,
    data.productId    || "",
    data.godownName   || "",
    data.name         || "",
    data.description  || "",
    data.unit         || "",
    conversions        || "None",
    0,   // current stock
    0,   // total in
    0,   // total out
    data.createdByName || "",
    "Active"
  ]);
  styleLastRow(sheet, "#0a2e1a");

  appendLog(ss, now, data.companyName, data.createdByName, "Product Added",
    `"${data.name}" in ${data.godownName}`);

  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  UPDATE PRODUCT
// ════════════════════════════════════════════════════════════════
function updateProduct(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());
  const sheetName = `[${data.companyName}] Products`;
  const sheet = ss.getSheetByName(sheetName);

  if (sheet) {
    const vals = sheet.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][1] === data.productId) {
        const conv = (data.conversions || []).map(c => `1 ${data.unit} = ${c.qty} ${c.unit}`).join(" | ");
        sheet.getRange(i + 1, 4).setValue(data.name         || vals[i][3]);
        sheet.getRange(i + 1, 5).setValue(data.description  || vals[i][4]);
        sheet.getRange(i + 1, 6).setValue(data.unit         || vals[i][5]);
        sheet.getRange(i + 1, 7).setValue(conv              || vals[i][6]);
        break;
      }
    }
  }

  appendLog(ss, now, data.companyName, data.updatedBy, "Product Updated", `"${data.name}"`);
  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  DELETE PRODUCT
// ════════════════════════════════════════════════════════════════
function deleteProduct(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());
  const sheetName = `[${data.companyName}] Products`;
  const sheet = ss.getSheetByName(sheetName);
  if (sheet) markRowStatus(sheet, null, data.productId, 1, "Deleted");

  appendLog(ss, now, data.companyName, data.deletedBy, "Product Deleted", `"${data.name}"`);
  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  ADD ENTRY (IN / OUT)  ← most important function
// ════════════════════════════════════════════════════════════════
function addEntry(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());

  // 1. Write to company Entries sheet
  const sheetName = `[${data.companyName}] Entries`;
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) sheet = createCompanyEntriesSheet(ss, data.companyName);

  const typeEmoji = data.type === "in" ? "📥 IN" : "📤 OUT";
  const qtyDisplay = data.enteredUnit !== data.baseUnit
    ? `${data.enteredQty} ${data.enteredUnit} (= ${data.qtyInBase} ${data.baseUnit})`
    : `${data.qtyInBase} ${data.baseUnit}`;

  sheet.appendRow([
    now,
    data.entryId       || "",
    data.godownName    || "",
    data.productName   || "",
    typeEmoji,
    qtyDisplay,
    data.qtyInBase     || 0,
    data.baseUnit      || "",
    data.newStock      || 0,
    data.note          || "",
    data.staffName     || "",
    data.staffId       || ""
  ]);

  // Colour by type
  const row = sheet.getLastRow();
  const color = data.type === "in" ? "#0a2e1a" : "#2e0a0a";
  sheet.getRange(row, 1, 1, 12).setBackground(color);

  // 2. Update stock in Products sheet
  const prodSheetName = `[${data.companyName}] Products`;
  const prodSheet = ss.getSheetByName(prodSheetName);
  if (prodSheet) {
    const vals = prodSheet.getDataRange().getValues();
    for (let i = 1; i < vals.length; i++) {
      if (vals[i][1] === data.productId) {
        // Col 8 = current stock, Col 9 = totalIn, Col 10 = totalOut
        prodSheet.getRange(i + 1, 8).setValue(data.newStock    || 0);
        prodSheet.getRange(i + 1, 9).setValue(data.totalIn     || 0);
        prodSheet.getRange(i + 1, 10).setValue(data.totalOut   || 0);
        break;
      }
    }
  }

  appendLog(ss, now, data.companyName, data.staffName, `Stock ${data.type.toUpperCase()}`,
    `${data.productName} — ${qtyDisplay} | Godown: ${data.godownName} | New stock: ${data.newStock} ${data.baseUnit}`);

  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  ADD NOTIFICATION
// ════════════════════════════════════════════════════════════════
function addNotification(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const now = formatDate(new Date());
  appendLog(ss, now, data.companyName || "System", data.triggeredBy || "System",
    "Notification", data.message || "");
  return jsonResponse({ status: "ok" });
}

// ════════════════════════════════════════════════════════════════
//  SHEET BUILDERS — creates sheets with styled headers
// ════════════════════════════════════════════════════════════════

function ensureMasterSheets(ss) {
  // All Companies
  if (!ss.getSheetByName(MASTER_COMPANIES)) {
    const s = ss.insertSheet(MASTER_COMPANIES);
    setHeader(s, ["Created At","Company Name","Corporate ID","Owner Name","Owner Email","UID","Status"]);
  }
  // All Users
  if (!ss.getSheetByName(MASTER_USERS)) {
    const s = ss.insertSheet(MASTER_USERS);
    setHeader(s, ["Created At","Company","Corporate ID","Name","Email","Role","UID","Status"]);
  }
  // Activity Log
  if (!ss.getSheetByName(MASTER_LOG)) {
    const s = ss.insertSheet(MASTER_LOG);
    setHeader(s, ["Timestamp","Company","Actor","Action","Details"]);
  }
}

function createCompanySheets(ss, data) {
  const company = data.companyName;

  // ── Overview ──
  const overviewName = `[${company}] Overview`;
  if (!ss.getSheetByName(overviewName)) {
    const s = ss.insertSheet(overviewName);
    s.getRange("A1").setValue("⚡ SwiftStock — " + company).setFontWeight("bold").setFontSize(14).setFontColor("#00e676");
    s.getRange("A2").setValue("Owner: " + data.name);
    s.getRange("A3").setValue("Corporate ID: " + data.corporateId);
    s.getRange("A4").setValue("Email: " + data.email);
    s.getRange("A5").setValue("Created: " + formatDate(new Date()));
    s.getRange("A1:B6").setBackground("#061510");
    s.getRange("A2:A6").setFontColor("#7aad97");
    s.setColumnWidth(1, 200);
    s.setColumnWidth(2, 300);
  }

  // ── Staff ──
  createCompanyStaffSheet(ss, company);

  // ── Godowns ──
  createCompanyGodownsSheet(ss, company);

  // ── Products ──
  createCompanyProductsSheet(ss, company);

  // ── Entries ──
  createCompanyEntriesSheet(ss, company);
}

function createCompanyStaffSheet(ss, company) {
  const name = `[${company}] Staff`;
  if (ss.getSheetByName(name)) return ss.getSheetByName(name);
  const s = ss.insertSheet(name);
  setHeader(s, ["Added At","Name","Corporate ID","Role","Email","UID","Added By","Status"]);
  return s;
}

function createCompanyGodownsSheet(ss, company) {
  const name = `[${company}] Godowns`;
  if (ss.getSheetByName(name)) return ss.getSheetByName(name);
  const s = ss.insertSheet(name);
  setHeader(s, ["Created At","Godown ID","Name","Location","Staff Access","Staff Names","Created By","Status"]);
  return s;
}

function createCompanyProductsSheet(ss, company) {
  const name = `[${company}] Products`;
  if (ss.getSheetByName(name)) return ss.getSheetByName(name);
  const s = ss.insertSheet(name);
  setHeader(s, ["Created At","Product ID","Godown","Name","Description","Base Unit","Conversions","Current Stock","Total IN","Total OUT","Created By","Status"]);
  // Wider columns for readability
  s.setColumnWidth(4, 200);
  s.setColumnWidth(5, 250);
  s.setColumnWidth(7, 280);
  return s;
}

function createCompanyEntriesSheet(ss, company) {
  const name = `[${company}] Entries`;
  if (ss.getSheetByName(name)) return ss.getSheetByName(name);
  const s = ss.insertSheet(name);
  setHeader(s, ["Timestamp","Entry ID","Godown","Product","Type","Quantity Display","Qty (Base)","Base Unit","Stock After","Note","Staff Name","Staff UID"]);
  s.setColumnWidth(6, 250);
  s.setColumnWidth(10, 250);
  return s;
}

// ════════════════════════════════════════════════════════════════
//  UTILITY HELPERS
// ════════════════════════════════════════════════════════════════

function setHeader(sheet, cols) {
  const range = sheet.getRange(1, 1, 1, cols.length);
  range.setValues([cols]);
  range.setBackground("#00e676");
  range.setFontColor("#060c10");
  range.setFontWeight("bold");
  range.setFontSize(10);
  sheet.setFrozenRows(1);
  sheet.setRowHeight(1, 30);
  // Auto-resize columns
  cols.forEach((_, i) => sheet.setColumnWidth(i + 1, Math.max(120, cols[i].length * 9)));
}

function styleLastRow(sheet, bgColor) {
  const row = sheet.getLastRow();
  if (row < 2) return;
  const numCols = sheet.getLastColumn();
  sheet.getRange(row, 1, 1, numCols).setBackground(bgColor || "#0a1a24");
  sheet.getRange(row, 1, 1, numCols).setFontColor("#dff2e8");
}

function appendLog(ss, timestamp, company, actor, action, details) {
  const logSheet = ss.getSheetByName(MASTER_LOG);
  if (!logSheet) return;
  logSheet.appendRow([timestamp, company || "", actor || "", action || "", details || ""]);
  styleLastRow(logSheet, "#0d1a22");
}

function markRowStatus(sheet, ssOrNull, matchVal, matchCol, newStatus) {
  // matchCol is 0-indexed
  const target = sheet || ssOrNull;
  if (!target) return;
  const vals = target.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (vals[i][matchCol] === matchVal) {
      // Status is always the last column
      const lastCol = vals[0].length;
      target.getRange(i + 1, lastCol).setValue(newStatus);
      target.getRange(i + 1, 1, 1, lastCol).setBackground("#1a0a0a").setFontColor("#a06060");
      break;
    }
  }
}

function formatDate(d) {
  return Utilities.formatDate(d, Session.getScriptTimeZone(), "dd-MMM-yyyy HH:mm:ss");
}

function capitalize(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getRoleColor(role) {
  const map = { owner: "#1a0a2e", manager: "#1f1500", employee: "#071a24", viewer: "#0d0d0d" };
  return map[role] || "#0a1a24";
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function logError(fn, err) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    ensureMasterSheets(ss);
    appendLog(ss, formatDate(new Date()), "SYSTEM", fn, "ERROR", err.toString());
  } catch(e) {}
}

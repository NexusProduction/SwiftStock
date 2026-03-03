// ╔══════════════════════════════════════════════════════════════╗
// ║  sheets.js — SwiftStock Google Sheets Sync Helper           ║
// ║  Include this in every HTML page via <script src="sheets.js">║
// ╚══════════════════════════════════════════════════════════════╝

// ── PASTE YOUR DEPLOYED WEB APP URL HERE AFTER DEPLOYMENT ──
// Steps to get this URL:
//  1. Open Apps Script → Deploy → New Deployment
//  2. Type: Web App
//  3. Execute as: Me
//  4. Who has access: Anyone
//  5. Click Deploy → Copy the URL → Paste below
const SHEETS_URL = "https://script.google.com/macros/s/AKfycbzdV3T7GnLEE_NEex9KY5F6Kjtnu5DZorokR5JCv4LPh85UfYONJJ2wFv7RHXvQAQU_uA/exec";

/**
 * Central sync function — call this from any page
 * @param {Object} payload - must include `action` field + data fields
 */
async function syncToSheets(payload) {
  if (!SHEETS_URL || SHEETS_URL === "https://script.google.com/macros/s/AKfycbzdV3T7GnLEE_NEex9KY5F6Kjtnu5DZorokR5JCv4LPh85UfYONJJ2wFv7RHXvQAQU_uA/exec") {
    console.warn("⚠ SwiftStock: Set SHEETS_URL in sheets.js to enable Google Sheets sync.");
    return;
  }
  try {
    await fetch(SHEETS_URL, {
      method: "POST",
      mode: "no-cors",  // Apps Script doesn't support full CORS
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    console.log("✅ Sheets synced:", payload.action);
  } catch (err) {
    console.warn("⚠ Sheets sync failed (non-critical):", err.message);
    // Non-critical — Firebase is the source of truth; Sheets is backup
  }
}

// ── Convenience wrappers for every action ──

// Called from signup.html when owner registers
function sheets_createOwner(userData) {
  return syncToSheets({ action: "createOwner", ...userData });
}

// Called from dashboard.html when staff is added
function sheets_createStaff(staffData) {
  return syncToSheets({ action: "createStaff", ...staffData });
}

// Called from dashboard.html when staff is removed
function sheets_deleteStaff(staffData) {
  return syncToSheets({ action: "deleteStaff", ...staffData });
}

// Called from profile edit
function sheets_updateProfile(data) {
  return syncToSheets({ action: "updateProfile", ...data });
}

// Called from dashboard.html when godown is created
function sheets_createGodown(godownData) {
  return syncToSheets({ action: "createGodown", ...godownData });
}

// Called when godown is deleted
function sheets_deleteGodown(godownData) {
  return syncToSheets({ action: "deleteGodown", ...godownData });
}

// Called from godown.html when product is added
function sheets_createProduct(productData) {
  return syncToSheets({ action: "createProduct", ...productData });
}

// Called from godown.html when product is edited
function sheets_updateProduct(productData) {
  return syncToSheets({ action: "updateProduct", ...productData });
}

// Called from godown.html when product is deleted
function sheets_deleteProduct(productData) {
  return syncToSheets({ action: "deleteProduct", ...productData });
}

// Called from godown.html on every IN/OUT entry — THE MOST IMPORTANT ONE
function sheets_addEntry(entryData) {
  return syncToSheets({ action: "addEntry", ...entryData });
}

// Called for notifications
function sheets_addNotification(notifData) {
  return syncToSheets({ action: "addNotification", ...notifData });
}

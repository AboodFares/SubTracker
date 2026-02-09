const pdfParse = require('pdf-parse');

/**
 * Extract raw text from a PDF buffer
 * @param {Buffer} buffer - PDF file buffer
 * @returns {Promise<{text: string, numPages: number}>}
 */
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return {
      text: data.text,
      numPages: data.numpages
    };
  } catch (error) {
    if (error.message && error.message.includes('encrypt')) {
      throw new Error('This PDF appears to be password-protected. Please upload an unprotected statement.');
    }
    throw new Error(`Failed to parse PDF: ${error.message}`);
  }
}

/**
 * Parse raw bank statement text into structured transactions
 * Handles common bank statement formats (date + description + amount per line)
 * @param {string} rawText - Raw text extracted from PDF
 * @returns {Array<{date: string, description: string, amount: number}>}
 */
function parseTransactions(rawText) {
  const transactions = [];
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Common date patterns: MM/DD, MM/DD/YYYY, MMM DD, DD/MM, YYYY-MM-DD
  const datePatterns = [
    /^(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/,           // MM/DD or MM/DD/YYYY
    /^(\w{3}\s+\d{1,2}(?:,?\s+\d{4})?)/,            // Jan 15 or Jan 15, 2026
    /^(\d{4}-\d{2}-\d{2})/,                           // 2026-01-15
    /^(\d{1,2}-\d{1,2}(?:-\d{2,4})?)/,               // DD-MM or DD-MM-YYYY
  ];

  // Amount pattern: optional negative sign, optional $, digits with optional decimal
  const amountPattern = /[-−]?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?$/;
  const amountInLinePattern = /[-−]?\$?\d{1,3}(?:,\d{3})*\.\d{2}/g;

  for (const line of lines) {
    let dateMatch = null;
    for (const pattern of datePatterns) {
      dateMatch = line.match(pattern);
      if (dateMatch) break;
    }

    const amounts = line.match(amountInLinePattern);
    if (!amounts || amounts.length === 0) continue;

    // Take the last amount on the line (usually the transaction amount)
    const rawAmount = amounts[amounts.length - 1];
    const amount = parseFloat(rawAmount.replace(/[$,−]/g, '').replace('−', '-'));

    if (isNaN(amount) || amount === 0) continue;

    // Extract description: everything between date and amount
    let description = line;
    if (dateMatch) {
      description = line.substring(dateMatch[0].length).trim();
    }
    // Remove the amount from the description
    const lastAmountIndex = description.lastIndexOf(rawAmount);
    if (lastAmountIndex > 0) {
      description = description.substring(0, lastAmountIndex).trim();
    }
    // Clean up description
    description = description.replace(/\s+/g, ' ').trim();

    if (description.length < 2) continue;

    transactions.push({
      date: dateMatch ? dateMatch[1] : null,
      description: description,
      amount: Math.abs(amount)
    });
  }

  return transactions;
}

module.exports = {
  extractTextFromPDF,
  parseTransactions
};

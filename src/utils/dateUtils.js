if (typeof Date !== 'undefined') {
    const originalToLocaleDateString = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = function(locale, options) {
        if (options && (options.month || options.weekday || options.year)) {
            return originalToLocaleDateString.call(this, locale, options);
        }
        const day = String(this.getDate()).padStart(2, '0');
        const month = String(this.getMonth() + 1).padStart(2, '0');
        const year = this.getFullYear();
        return `${day}-${month}-${year}`;
    };
}

export function parseCustomDate(str) {
    if (!str) return null;
    const s = String(str).trim();
    // Match DD-MMM-YYYY (e.g. 19-Jun-2026 or 19-Jun-26)
    const monthMap = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const mMatch = s.match(/^(\d{1,2})[-/]([a-z]{3})[-/](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?)?/i);
    if (mMatch) {
        const day = parseInt(mMatch[1], 10);
        const monthStr = mMatch[2].toLowerCase();
        const month = monthMap[monthStr] !== undefined ? monthMap[monthStr] : 0;
        let year = parseInt(mMatch[3], 10);
        if (year < 100) year += 2000;
        let hour = mMatch[4] ? parseInt(mMatch[4], 10) : 0;
        const minute = mMatch[5] ? parseInt(mMatch[5], 10) : 0;
        const ampm = mMatch[6];
        if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
            if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        }
        return new Date(year, month, day, hour, minute);
    }
    // Match DD-MM-YYYY HH:MM AM/PM or similar
    const match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*([AP]M)?)?/i);
    if (match) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        const year = parseInt(match[3], 10);
        let hour = match[4] ? parseInt(match[4], 10) : 0;
        const minute = match[5] ? parseInt(match[5], 10) : 0;
        const ampm = match[6];
        if (ampm) {
            if (ampm.toUpperCase() === 'PM' && hour < 12) hour += 12;
            if (ampm.toUpperCase() === 'AM' && hour === 12) hour = 0;
        }
        return new Date(year, month, day, hour, minute);
    }
    // Fallback to ISO-like YYYY-MM-DD
    // If it ends with Z, it is a UTC string; let it fall through to native parsing so timezone conversion is correct.
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
    if (isoMatch && !s.endsWith('Z')) {
        const year = parseInt(isoMatch[1], 10);
        const month = parseInt(isoMatch[2], 10) - 1;
        const day = parseInt(isoMatch[3], 10);
        const hour = isoMatch[4] ? parseInt(isoMatch[4], 10) : 0;
        const minute = isoMatch[5] ? parseInt(isoMatch[5], 10) : 0;
        return new Date(year, month, day, hour, minute);
    }
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
}

export function toDateKey (value) {
    if (!value) return '';
    const isUTC = typeof value === 'string' && value.endsWith('Z');
    const parsed = parseCustomDate(value);
    if (parsed) {
        const y = isUTC ? parsed.getUTCFullYear() : parsed.getFullYear();
        const m = String((isUTC ? parsed.getUTCMonth() : parsed.getMonth()) + 1).padStart(2, '0');
        const d = String(isUTC ? parsed.getUTCDate() : parsed.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return '';
}


/**
 * Calculate DAA (Days After Application) using normalized calendar dates only.
 */
export function calculateDAA (photoDate, trialDate) {
    try {
        const pKey = toDateKey(photoDate);
        const tKey = toDateKey(trialDate);
        if (!pKey || !tKey) {
            console.warn('[DAA] Invalid date provided:', { photoDate, trialDate });
            return 0;
        }

        const [py, pm, pd] = pKey.split('-').map(Number);
        const [ty, tm, td] = tKey.split('-').map(Number);
        const pUTC = Date.UTC(py, pm - 1, pd);
        const tUTC = Date.UTC(ty, tm - 1, td);

        const daa = Math.floor((pUTC - tUTC) / (1000 * 60 * 60 * 24));
        return Math.max(0, daa);
    } catch (e) {
        console.error('[DAA] Calculation failed:', e);
        return 0;
    }
}

export function hasTimeComponent(str) {
    if (!str) return false;
    const s = String(str).trim();
    // If it is a UTC ISO string (ends with Z or contains .000), it's a legacy date-only value
    if (s.endsWith('Z') || s.includes('.000')) {
        return false;
    }
    // Check if it has a space or T followed by a time: e.g. "T13:30" or " 13:30" or "10:23 AM"
    const match = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2}):(\d{2})/i);
    if (match) return true;
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (isoMatch) return true;
    // Generic check for presence of time indicator (e.g. "12:00" or "AM/PM")
    if (s.includes(':') || /am|pm/i.test(s)) return true;
    return false;
}

export function formatPhotoDate(dateStr) {
    return formatDateTime(dateStr);
}

export function formatDateTime(dateInput) {
    if (!dateInput) return '';
    if (!hasTimeComponent(dateInput)) {
        return formatDate(dateInput);
    }
    const d = parseCustomDate(dateInput);
    if (!d) return String(dateInput);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const hoursStr = String(hours).padStart(2, '0');

    return `${day}-${month}-${year} ${hoursStr}:${minutes} ${ampm}`;
}

export function formatDate(dateInput) {
    if (!dateInput) return '';
    const d = parseCustomDate(dateInput);
    if (!d) return String(dateInput);

    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();

    return `${day}-${month}-${year}`;
}

export function toDatetimeLocal(dateInput) {
    const d = dateInput ? (parseCustomDate(dateInput) || new Date()) : new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}`;
}

export function parseDateFromFilename(filename, trialDateStr) {
  if (!filename) return null;
  const cleanName = filename.replace(/\.[^/.]+$/, "").trim();
  
  // 1. Check for full DD-MM-YYYY or DD_MM_YYYY
  const dmYMatch = cleanName.match(/\b(\d{1,2})[-_](\d{1,2})[-_](\d{4})\b/);
  if (dmYMatch) {
    const d = String(dmYMatch[1]).padStart(2, '0');
    const m = String(dmYMatch[2]).padStart(2, '0');
    const y = dmYMatch[3];
    return `${y}-${m}-${d}`;
  }

  // 2. Check for full YYYY-MM-DD or YYYY_MM_DD
  const ymdMatch = cleanName.match(/\b(\d{4})[-_](\d{1,2})[-_](\d{1,2})\b/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(ymdMatch[2]).padStart(2, '0');
    const d = String(ymdMatch[3]).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // If we have a valid trial date, we can use it to resolve partial dates or DAA
  if (trialDateStr) {
    const tKey = toDateKey(trialDateStr); // YYYY-MM-DD
    if (tKey) {
      const [ty, tm, td] = tKey.split('-').map(Number);
      
      // 3. Check for DAA patterns: "daa 2", "daa2", "day 2", "day2", "daa_2"
      const daaMatch = cleanName.match(/\b(?:daa|day)[-_ ]*(\d+)\b/i) || cleanName.match(/\b(\d+)[-_ ]*(?:daa|day)\b/i);
      if (daaMatch) {
        const daaOffset = parseInt(daaMatch[1], 10);
        const tDate = new Date(Date.UTC(ty, tm - 1, td));
        tDate.setUTCDate(tDate.getUTCDate() + daaOffset);
        const ry = tDate.getUTCFullYear();
        const rm = String(tDate.getUTCMonth() + 1).padStart(2, '0');
        const rd = String(tDate.getUTCDate()).padStart(2, '0');
        return `${ry}-${rm}-${rd}`;
      }

      // 4. Check for day of month patterns: e.g. "19th", "17th", "day 19", "day 17"
      // Match "19th", "17th", etc. or a standalone number 1-31
      // We look for patterns like "pot c 19" or "pot a 17" or "pot a 17th"
      const dayMatch = cleanName.match(/\b(\d{1,2})(?:st|nd|rd|th)\b/i) || cleanName.match(/\b(?:pot|plant)[-_ ]*[a-z0-9]+[-_ ]+(\d{1,2})\b/i);
      if (dayMatch) {
        const dayVal = parseInt(dayMatch[1], 10);
        if (dayVal >= 1 && dayVal <= 31) {
          // Construct using trial's year and month
          // If the day is smaller than the trial start day, it might belong to the next month
          let targetMonth = tm;
          let targetYear = ty;
          if (dayVal < td) {
            targetMonth = tm + 1;
            if (targetMonth > 12) {
              targetMonth = 1;
              targetYear += 1;
            }
          }
          return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(dayVal).padStart(2, '0')}`;
        }
      }
    }
  }

  return null;
}
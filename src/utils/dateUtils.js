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
    if (str instanceof Date) return str;
    const s = String(str).trim();
    const monthMap = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    
    // Check if the string contains any month name (e.g. Jun, June, Jan)
    const lowerStr = s.toLowerCase();
    let foundMonth = null;
    let foundMonthIndex = -1;
    for (const mName of Object.keys(monthMap)) {
        if (lowerStr.includes(mName)) {
            foundMonth = mName;
            foundMonthIndex = monthMap[mName];
            break;
        }
    }

    if (foundMonth !== null) {
        // Extract all numbers from the string
        const numbers = s.match(/\d+/g);
        if (numbers && numbers.length > 0) {
            const day = parseInt(numbers[0], 10);
            let year = new Date().getFullYear();
            if (numbers.length > 1) {
                let possibleYear = parseInt(numbers[1], 10);
                if (possibleYear > 31) {
                    year = possibleYear;
                    if (year < 100) year += 2000;
                } else if (numbers.length > 2) {
                    let possibleYear3 = parseInt(numbers[2], 10);
                    if (possibleYear3 > 31) {
                        year = possibleYear3;
                        if (year < 100) year += 2000;
                    }
                }
            }
            return new Date(year, foundMonthIndex, day);
        }
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

export function parsePhotoInfoFromFilename(filename, trialDateStr) {
  if (!filename) return null;
  const cleanName = filename.replace(/\.[^/.]+$/, "").trim();

  // Try to match the descriptive format: photo_[TrialID]_[SafeTag]_DAA-[Daa]_[Timestamp]
  // e.g. photo_022f35af-3761-4995-ad3b-178297619223_Plant_1_(Pot_A)_-_Whole_Canopy_(Standard)_DAA-7_1719914400000
  const descriptiveMatch = cleanName.match(/^photo_([a-f0-9\-]+)_(.+)_DAA-(\d+)_(\d+)$/i);
  if (descriptiveMatch) {
    const rawTag = descriptiveMatch[2];
    const tag = rawTag.replace(/_/g, ' ');
    const daa = parseInt(descriptiveMatch[3], 10);
    const ts = parseInt(descriptiveMatch[4], 10);
    let date = null;
    if (!isNaN(ts)) {
      try {
        const dObj = new Date(ts);
        if (!isNaN(dObj.getTime())) {
          date = dObj.toISOString();
        }
      } catch (e) {}
    }
    return {
      tag,
      label: 'Field Observation',
      daa,
      date
    };
  }

  // Parse using existing logic if not descriptive
  let photoDate = parseDateFromFilename(filename, trialDateStr);
  let label = cleanName;
  let strippedLabel = label;
  strippedLabel = strippedLabel.replace(/\d{2}[-_]\d{2}[-_]\d{4}/g, '');
  strippedLabel = strippedLabel.replace(/\d{4}[-_]\d{2}[-_]\d{2}/g, '');
  strippedLabel = strippedLabel.replace(/\d{2}[:_]\d{2}\s*(AM|PM|am|pm)?/g, '');
  strippedLabel = strippedLabel.replace(/^[\s\-_]+|[\s\-_]+$/g, '');
  
  if (strippedLabel) {
    label = strippedLabel;
  }

  return {
    tag: 'Field Observation',
    label,
    daa: null,
    date: photoDate
  };
}
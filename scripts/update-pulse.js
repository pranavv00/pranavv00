import fs from 'fs/promises';
import path from 'path';
import Parser from 'rss-parser';

const parser = new Parser();

const FEED_URLS = [
  'https://techcrunch.com/feed/',
  'https://www.theverge.com/rss/index.xml',
  'https://hnrss.org/frontpage'
];

const MAX_UPDATES = 5;
const PULSE_FILE = path.join(process.cwd(), 'data', 'pulse.json');
const README_FILE = path.join(process.cwd(), '..', 'README.md');

function cleanTitle(title) {
  // Remove trailing site names or standard tags if any, to keep it concise
  return title
    .replace(/\s*[-|]\s*TechCrunch$/i, '')
    .replace(/\s*[-|]\s*The Verge$/i, '')
    .trim();
}

async function fetchLatestUpdates() {
  const allItems = [];

  for (const url of FEED_URLS) {
    try {
      const feed = await parser.parseURL(url);
      if (feed.items && feed.items.length > 0) {
        // Take the top 3 from each to give a good pool
        feed.items.slice(0, 3).forEach(item => {
          allItems.push({
            title: cleanTitle(item.title),
            link: item.link,
            date: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
            source: feed.title || 'Tech News'
          });
        });
      }
    } catch (error) {
      console.error(`Failed to fetch ${url}:`, error.message);
    }
  }

  // Sort by date descending
  allItems.sort((a, b) => b.date - a.date);

  // De-duplicate by title
  const uniqueItems = [];
  const seenTitles = new Set();
  
  for (const item of allItems) {
    if (!seenTitles.has(item.title)) {
      seenTitles.add(item.title);
      uniqueItems.push(item);
      if (uniqueItems.length >= MAX_UPDATES) break;
    }
  }

  return uniqueItems;
}

function generateMarkdown(updates) {
  const now = new Date();
  // Format like "03:00 UTC"
  const timeString = now.toISOString().substring(11, 16) + ' UTC';

  let md = `🛰️ Live Tech Pulse\n━━━━━━━━━━━━━━━━━━\n\n`;
  
  if (updates.length === 0) {
    md += `→ Waiting for signal...\n\n`;
  } else {
    updates.forEach(update => {
      // Create a markdown link if we want, or just raw text. The user's example was raw text arrows.
      // E.g. "→ [Title](link)"
      md += `→ [${update.title}](${update.link})\n`;
    });
  }

  md += `\nLast Sync: ${timeString}`;
  return md;
}

async function updateReadme(markdownContent) {
  try {
    const readmeContent = await fs.readFile(README_FILE, 'utf-8');
    
    const startTag = '<!-- PULSE:START -->';
    const endTag = '<!-- PULSE:END -->';
    
    const startIndex = readmeContent.indexOf(startTag);
    const endIndex = readmeContent.indexOf(endTag);
    
    if (startIndex === -1 || endIndex === -1) {
      console.error('Pulse markers not found in README.md');
      return false;
    }
    
    const newReadmeContent = 
      readmeContent.substring(0, startIndex + startTag.length) +
      '\n\n' + markdownContent + '\n\n' +
      readmeContent.substring(endIndex);
      
    await fs.writeFile(README_FILE, newReadmeContent, 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to update README:', error.message);
    return false;
  }
}

async function run() {
  try {
    console.log('Fetching latest tech updates...');
    const latestUpdates = await fetchLatestUpdates();
    
    let previousUpdates = [];
    try {
      const data = await fs.readFile(PULSE_FILE, 'utf-8');
      previousUpdates = JSON.parse(data);
    } catch (e) {
      // File doesn't exist or invalid JSON, ignore
    }
    
    // We update anyway to change the "Last Sync" time, but we can check if content is strictly identical
    // Actually, user wants it to run every 3 hours and update the timestamp. So we always write.
    
    await fs.writeFile(PULSE_FILE, JSON.stringify(latestUpdates, null, 2), 'utf-8');
    console.log('Saved data to pulse.json');
    
    const markdown = generateMarkdown(latestUpdates);
    
    const updated = await updateReadme(markdown);
    if (updated) {
      console.log('Successfully injected Live Tech Pulse into README.md');
    }
  } catch (error) {
    console.error('Error during execution:', error);
    process.exit(1);
  }
}

run();

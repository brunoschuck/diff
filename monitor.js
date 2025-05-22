const fs = require('fs');
const axios = require('axios');
const slugify = require('slugify');
const { diffLines } = require('diff');
const cheerio = require('cheerio');

const historicoPath = './historico.json';
const urlsPath = './urls.txt';

async function fetchHTML(url) {
  const res = await axios.get(url);
  return res.data;
}

// Extrai apenas conteúdo relevante para SEO/comparação
function extractRelevantContent(html) {
  const $ = cheerio.load(html);
  const content = [];

  const title = $('title').text();
  if (title) content.push(`<title>${title}</title>`);

  const metaDescription = $('meta[name="description"]').attr('content');
  if (metaDescription) content.push(`<meta name="description" content="${metaDescription}">`);

  // $('h1, h2, h3, h4, h5, h6, p, textarea').each((_, el) => {
  $('h1, h2, h3').each((_, el) => {
    const tag = el.tagName.toLowerCase();
    const text = $(el).text().trim();
    if (text) {
      content.push(`<${tag}>${text}</${tag}>`);
    }
  });

  return content.join('\n');
}

function compareRelevantChanges(oldRelevant, newRelevant) {
  const diffs = diffLines(oldRelevant, newRelevant);
  return diffs.filter(line => line.added || line.removed);
}

function loadHistorico() {
  if (fs.existsSync(historicoPath)) {
    const data = fs.readFileSync(historicoPath, 'utf-8');
    if (data.trim() === '') return [];
    try {
      return JSON.parse(data);
    } catch (error) {
      console.error('Erro ao ler o histórico. O arquivo pode estar corrompido:', error);
      return [];
    }
  }
  return [];
}

function saveHistorico(data) {
  fs.writeFileSync(historicoPath, JSON.stringify(data, null, 2));
}

async function processURL(url) {
  try {
    const fullHtml = await fetchHTML(url);
    const relevantHtml = extractRelevantContent(fullHtml);

    const filename = slugify(url, { remove: /[*+~.()'"!:@\\/]/g });
    const folderPath = './data';
    const fullFilePath = `${folderPath}/${filename}.html`;
    const relevantFilePath = `${folderPath}/${filename}.seo.txt`;

    fs.mkdirSync(folderPath, { recursive: true });

    let oldRelevantHtml = '';
    let firstTime = false;

    if (!fs.existsSync(relevantFilePath)) {
      firstTime = true;
    } else {
      oldRelevantHtml = fs.readFileSync(relevantFilePath, 'utf-8');
    }

    // Sempre salva o HTML completo
    fs.writeFileSync(fullFilePath, fullHtml);
    // Sempre salva o HTML relevante também
    fs.writeFileSync(relevantFilePath, relevantHtml);

    const changes = compareRelevantChanges(oldRelevantHtml, relevantHtml);

    if (firstTime) {
      return {
        url,
        date: new Date().toISOString(),
        changed: false,
        changes: []
      };
    }

    return {
      url,
      date: new Date().toISOString(),
      changed: changes.length > 0,
      changes: changes.length > 0 ? changes.map(c => c.value.trim()).slice(0, 5) : []
    };

  } catch (error) {
    console.error(`Erro ao processar URL ${url}:`, error);
    return {
      url,
      date: new Date().toISOString(),
      changed: false,
      changes: []
    };
  }
}

(async () => {
  if (!fs.existsSync(urlsPath)) {
    console.error(`O arquivo ${urlsPath} não foi encontrado.`);
    return;
  }

  const urls = fs.readFileSync(urlsPath, 'utf-8').split('\n').filter(Boolean);
  let historico = loadHistorico();

  for (const url of urls) {
    const res = await processURL(url);

    if (res.changed) {
      historico.push(res);
      console.log(`[${res.date}] ${res.url} → 🟠 MUDANÇA`);
    } else {
      console.log(`[${res.date}] ${res.url} → 🟢 sem alteração`);
    }
  }

  saveHistorico(historico);
})();

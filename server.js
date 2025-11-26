import express from 'express';
import puppeteer from 'puppeteer';
import bodyParser from "body-parser";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";

let browser;
const app = express();
const PORT = 3333;

// chart size
const width = 800;
const height = 400;
const backgroundColour = 'white';
const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour});

app.use(bodyParser.json());

(async () => {
  browser = await puppeteer.launch({
    headless: true,
    defaultViewport: null,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
    ]
  });
  console.log("Chromium launched.");
})();

const look = async ({ name, year, institution }) => {
  const page = await browser.newPage();

  await page.goto('https://elhkpn.kpk.go.id/portal/user/login');

  // close first modal
  await page.waitForSelector('.remodal-one.remodal-is-opened');
  await page.locator('.remodal-one > button[data-remodal-action="close"]').click();

  // close second modal
  await page.waitForSelector('.remodal-two.remodal-is-opened');
  await page.locator('.remodal-two > button[data-remodal-action="close"]').click();

  // scroll to #ajaxFormCari
  await page.waitForSelector('#ajaxFormCari');
  await page.evaluate(() => {
      document.querySelector('#ajaxFormCari').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  await page.type('#CARI_NAMA', name, { delay: 300 });
  if (year) await page.type('#CARI_TAHUN', year, { delay: 300 });
  if (institution) await page.type('#CARI_LEMBAGA', institution, {delay: 300});
  await page.click('#ajaxFormCari button[type="submit"]');

  // click submit and wait for redirect
  await Promise.all([ page.waitForNavigation({ waitUntil: 'networkidle0' }), ]);

  // ensure correct url
  await page.waitForFunction(() => window.location.href.includes('/portal/user/check_search_announ') );

  // extract table rows
  const tableData = await page.$$eval('table > tbody tr', (rows) => {
      return rows.map((row) => {
          const cols = Array.from(row.querySelectorAll('td'));
          const raw = cols.map((td) => td.innerText.trim());
          const id = row.querySelector('#DownloadPDFII').getAttribute('data-id');
          raw[cols.length - 1] = id;
          return raw.slice(6)
      });
  });

  console.log(tableData);

  await page.close();

  return tableData;
}

const graph = async (data = []) => {
  // Extract x (dates) & y (values)
  const labels = data.map(item => item[4]);
  const values = data.map(item =>
    Number(item[6].replace(/[Rp.\s]/g, ""))
  );

  console.log({labels, values});

  const configuration = {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: "Total Harta Kekayaan",
        data: values,
        borderWidth: 3,
        tension: 0.3
      }]
    }
  };

  const image = await chartJSNodeCanvas.renderToBuffer(configuration);

  return image;
}

app.get('/search', async (req, res) => {
  const { name, year, institution } = req.query;

  if (!name) {
    return res.status(400).json({
      error: 'Missing query params: name'
    });
  }

  try {

    const tableData = await look({ name, year, institution})

    res.json({
      status: 'ok',
      count: tableData.length,
      data: tableData
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/chart", async (req, res) => {

  const data = req.body.data;

  if (!data || !Array.isArray(data)) {
    return res.status(400).json({
      success: false,
      message: "Invalid data format. Expected: { data: [ ... ] }"
    });
  }

  const image = await graph(data);

  res.setHeader("Content-Type", "image/png");
  res.send(image);
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});

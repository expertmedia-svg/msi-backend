const fs = require('fs');
const pdf = require('pdf-parse');

async function processPdf(filename, outname) {
  try {
    let dataBuffer = fs.readFileSync(filename);
    let data = await pdf(dataBuffer);
    fs.writeFileSync(outname, data.text);
    console.log('Saved ' + outname);
  } catch (err) {
    console.error('Error reading ' + filename, err.message);
  }
}

async function main() {
  await processPdf('../offre_technique_MSI_COMSTRAT.pdf', 'spec1.txt');
  await processPdf('../file-10766261-abee9f4e-a63b-4f0e-bca9-001189f1fb48.pdf', 'spec2.txt');
}
main();

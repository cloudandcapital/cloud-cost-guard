const fs=require('node:fs');
const {test,expect}=require('@playwright/test');
const {expectExactPageOverflow}=require('./helpers');
const file=text=>({name:'daily.csv',mimeType:'text/csv',buffer:Buffer.from(text)});
const daily=(service,baseline=100,observed=250)=>'ChargePeriodStart,ChargePeriodEnd,ServiceName,BilledCost,BillingCurrency,ProviderName,BillingPeriodStart,BillingPeriodEnd\n'+Array.from({length:30},(_,i)=>`${new Date(Date.UTC(2026,8,i+1)).toISOString().slice(0,10)},${new Date(Date.UTC(2026,8,i+2)).toISOString().slice(0,10)},${service},${i===20?observed:baseline},USD,AWS,2026-09-01,2026-10-01`).join('\n');
const upload=async(page,text)=>{await page.getByLabel('Current billing CSV files',{exact:true}).setInputFiles(file(text));await page.getByRole('button',{name:'Review my bill',exact:true}).click();};
test.beforeEach(async({page})=>{await page.goto('/');});
test.afterEach(async({page})=>{await expectExactPageOverflow(page);});

test('Amazon and Lambda spikes finish the report instead of blaming the file',async({page},info)=>{
  for(const service of ['Amazon EC2','Amazon Route 53','Lambda']) {
    await upload(page,daily(service));
    await expect(page.getByTestId('billing-net-total')).toHaveText('$3,150.00');
    await expect(page.getByRole('heading',{name:`${service} spending spike on Sep 21, 2026`,exact:true})).toBeVisible();
    await expect(page.locator('.billing-upload-findings')).toContainText('cost $250.00');
    await expect(page.locator('.billing-upload-findings')).toContainText('Daily spending check');
    await expect(page.locator('.billing-upload-findings')).not.toContainText('Watchdog · Critical');
    if(service==='Amazon EC2')await page.screenshot({path:info.outputPath('audit-amazon-spike.png'),fullPage:true});
    await page.getByRole('button',{name:'Clear my data',exact:true}).click();
  }
});

test('a zero baseline reads as new spending on screen and in local Lumen',async({page},info)=>{
  await upload(page,daily('S3',0,50));
  await expect(page.getByTestId('billing-net-total')).toHaveText('$50.00');
  await expect(page.getByRole('heading',{name:'New S3 spending on Sep 21, 2026',exact:true})).toBeVisible();
  await expect(page.locator('.billing-upload-findings')).not.toContainText('spending drop');
  await page.screenshot({path:info.outputPath('audit-new-spending.png'),fullPage:true});
  await page.getByTestId('lumen-trigger').click();
  const input=page.getByLabel('Ask Lumen about your uploaded report');
  await input.fill('Did Watchdog find a spike?');await input.press('Enter');
  await expect(page.getByTestId('lumen-announcement')).toContainText('New S3 spending');
  await expect(page.getByTestId('lumen-announcement')).toContainText('median was $0.00');
});

test('month-end tax keeps a possible total visible through local answers and real print output',async({page},info)=>{
  await upload(page,'Date,EndDate,Service,Cost,Currency\n2026-09-01,2026-10-01,EC2,100,USD\n2026-09-01,2026-10-01,S3,20,USD\n2026-09-30,2026-10-01,Tax,9.60,USD\n2026-09-01,2026-10-01,Amazon Web Services,129.60,USD');
  await expect(page.getByTestId('billing-net-total')).toHaveText('$259.20');
  await expect(page.getByTestId('billing-bill-checks')).toContainText('look for possible total rows');
  await expect(page.getByTestId('billing-potential-total')).toContainText('It matches');
  await expect(page.getByTestId('billing-potential-total')).toContainText('All rows are still included');
  await page.screenshot({path:info.outputPath('audit-mixed-date-total.png'),fullPage:true});
  await page.getByTestId('lumen-trigger').click();
  const input=page.getByLabel('Ask Lumen about your uploaded report');
  await input.fill('Will you explain my bill?');await input.press('Enter');
  await expect(page.getByTestId('lumen-announcement')).toContainText('$259.20');
  await expect(page.getByTestId('lumen-announcement')).toContainText('All rows are still included');
  await expect(page.getByTestId('lumen-announcement')).not.toContainText('does not establish forecasts');
  await input.fill('What will my budget be?');await input.press('Enter');
  await expect(page.getByTestId('lumen-announcement')).toContainText('cannot tell what a future month will cost');
  await page.getByRole('button',{name:'Close',exact:true}).click();
  const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Printable report',exact:true}).click()]);
  const target=info.outputPath(download.suggestedFilename());await download.saveAs(target);
  const html=fs.readFileSync(target,'utf8');expect(html).toContain('Check a possible total row');
  if(info.project.name==='desktop-1440x1000') {
    const printPage=await page.context().newPage();await printPage.setContent(html);await printPage.emulateMedia({media:'print'});
    for(const format of ['A4','Letter']) {
      const pdf=await printPage.pdf({path:info.outputPath(`audit-printed-possible-${format}.pdf`),format,printBackground:false,margin:{top:'12mm',bottom:'12mm',left:'12mm',right:'12mm'}});
      const pages=(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length;expect(pages).toBeGreaterThan(0);expect(pages).toBeLessThanOrEqual(2);
    }
    await printPage.close();
  }
});

test('Total tax and Total VAT remain real charges',async({page})=>{
  for(const label of ['Total tax','Total VAT']) {
    await upload(page,`Date,Service,Cost,Currency\n2026-09-02,EC2,100,USD\n2026-09-02,S3,20,USD\n2026-09-30,${label},9.60,USD`);
    await expect(page.getByTestId('billing-net-total')).toHaveText('$129.60');
    await expect(page.getByTestId('billing-report')).toContainText(label);
    await page.getByRole('button',{name:'Clear my data',exact:true}).click();
  }
});

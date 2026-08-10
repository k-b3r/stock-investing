import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCompanyProfile } from './pse-edge';

const FULL_FIXTURE_HTML = `
<html><body>
<table class="view">
  <caption>Company Description</caption>
  <tr>
    <td>BDO Unibank Inc. (BDO), originally known as Acme Savings Bank, was acquired by the SM Group in 1976. BDO listed its shares on the Philippine Stock Exchange on May 21, 2002. The Company merged with Equitable PCI Bank in May 2007.<br/><br/>BDO offers an array of products and services including lending (corporate and consumer), deposit-taking, foreign exchange brokering, trust and investments, credit cards, retail cash cards, corporate cash management and remittances. Through its subsidiaries, the Company offers leasing and financing, investment banking, private banking, rural banking, life insurance, property and casualty insurance brokerage, and online and traditional stock brokerage services.<br/><br/>The Company's subsidiaries include BDO Capital & Investment Corporation; BDO Private Bank, Inc.; BDO Leasing and Finance, Inc.; BDO Finance Corporation; and BDO Securities Corporation.<br/><br/>As of December 31, 2024, BDO's network consists of 1,791 operating domestic branches (inclusive of one branch each in Hong Kong and Singapore), 4,923 automated teller machines, 481 universal teller machines, 411 cash accept machines, and 14 overseas remittance and representative offices across Asia, North America, Europe, and the Middle East.<br/> <br/>Source: SEC Form 17-A (2024)</td>
  </tr>
</table>
<table class="view">
  <caption>Security Information</caption>
  <tr><th>Sector</th><td>Financials</td></tr>
  <tr><th>Subsector</th><td>Banks</td></tr>
  <tr><th>Corporate Life</th><td>0</td></tr>
  <tr><th>Incorporation Date</th><td>Dec 20, 1967</td></tr>
  <tr><th>Number of Directors</th><td>11</td></tr>
  <tr><th>Fiscal Year</th><td>12/31\n      (Month/Day)\n      </td></tr>
  <tr><th>External Auditor</th><td>Punongbayan &amp; Araullo\t</td></tr>
  <tr><th>Transfer Agent</th><td>Stock Transfer Service, Inc.</td></tr>
</table>
<table class="view">
  <caption>Contact Information</caption>
  <tr><th>Business Address</th><td>BDO Corporate Center, Makati City</td></tr>
  <tr><th>Telephone Number</th><td>(632) 8840-7000</td></tr>
  <tr><th>Website</th><td>http://www.bdo.com.ph </td></tr>
</table>
</body></html>
`;

const EXPECTED_DESCRIPTION =
  "BDO Unibank Inc. (BDO), originally known as Acme Savings Bank, was acquired by the SM Group in 1976. BDO listed its shares on the Philippine Stock Exchange on May 21, 2002. The Company merged with Equitable PCI Bank in May 2007.\n\n" +
  "BDO offers an array of products and services including lending (corporate and consumer), deposit-taking, foreign exchange brokering, trust and investments, credit cards, retail cash cards, corporate cash management and remittances. Through its subsidiaries, the Company offers leasing and financing, investment banking, private banking, rural banking, life insurance, property and casualty insurance brokerage, and online and traditional stock brokerage services.\n\n" +
  "The Company's subsidiaries include BDO Capital & Investment Corporation; BDO Private Bank, Inc.; BDO Leasing and Finance, Inc.; BDO Finance Corporation; and BDO Securities Corporation.\n\n" +
  "As of December 31, 2024, BDO's network consists of 1,791 operating domestic branches (inclusive of one branch each in Hong Kong and Singapore), 4,923 automated teller machines, 481 universal teller machines, 411 cash accept machines, and 14 overseas remittance and representative offices across Asia, North America, Europe, and the Middle East.\n \n" +
  "Source: SEC Form 17-A (2024)";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchSequence(responses: { ok: boolean; json?: unknown; text?: string }[]) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(() => {
    const r = responses[call];
    call += 1;
    return Promise.resolve({
      ok: r.ok,
      json: () => Promise.resolve(r.json),
      text: () => Promise.resolve(r.text ?? ''),
    });
  }));
}

describe('getCompanyProfile', () => {
  it('parses description, sector, subsector, incorporationDate, and website from a full page', async () => {
    stubFetchSequence([
      { ok: true, json: [{ cmpyId: '260', cmpyNm: 'BDO Unibank, Inc.' }] },
      { ok: true, text: FULL_FIXTURE_HTML },
    ]);

    const profile = await getCompanyProfile('BDO');

    expect(profile).not.toBeNull();
    expect(profile!.description).toBe(EXPECTED_DESCRIPTION);
    expect(profile!.sector).toBe('Financials');
    expect(profile!.subsector).toBe('Banks');
    expect(profile!.incorporationDate).toBe('Dec 20, 1967');
    expect(profile!.website).toBe('http://www.bdo.com.ph');
  });

  it('returns null for individual fields whose table/row is missing, not the whole profile', async () => {
    const partialHtml = `
      <html><body>
      <table class="view">
        <caption>Security Information</caption>
        <tr><th>Sector</th><td>Financials</td></tr>
      </table>
      </body></html>
    `;
    stubFetchSequence([
      { ok: true, json: [{ cmpyId: '260', cmpyNm: 'BDO Unibank, Inc.' }] },
      { ok: true, text: partialHtml },
    ]);

    const profile = await getCompanyProfile('BDO');

    expect(profile).not.toBeNull();
    expect(profile!.sector).toBe('Financials');
    expect(profile!.description).toBeNull();
    expect(profile!.subsector).toBeNull();
    expect(profile!.incorporationDate).toBeNull();
    expect(profile!.website).toBeNull();
  });

  it('returns null when the ticker cannot be resolved to a cmpyId', async () => {
    stubFetchSequence([{ ok: true, json: [] }]);

    const profile = await getCompanyProfile('NOTATICKER');

    expect(profile).toBeNull();
  });

  it('returns null when the company information page fetch fails', async () => {
    stubFetchSequence([
      { ok: true, json: [{ cmpyId: '260', cmpyNm: 'BDO Unibank, Inc.' }] },
      { ok: false },
    ]);

    const profile = await getCompanyProfile('BDO');

    expect(profile).toBeNull();
  });
});

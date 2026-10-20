import { describe, expect, it, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { Kiritma } from './Sahifa';
import { ENTITY_CONFIGS } from './forms/SharedForms';
vi.mock('../../i18n/til', () => ({ t: (s: string) => s }));
afterEach(cleanup);
describe('system-wide money entry', () => {
  it('shows groups but retains canonical raw value; quantity remains native', () => {
    function Form() {
      const [v, set] = useState('120256205845.50');
      return <><label>Contract amount<Kiritma tur="money" qiymat={v} ozgardi={set} /></label><label>Quantity<Kiritma tur="number" qiymat={12} ozgardi={() => {}} /></label><output aria-label="raw">{v}</output></>;
    }
    render(<Form />);
    const money = screen.getByLabelText('Contract amount') as HTMLInputElement;
    expect(money.value).toBe('120 256 205 845.50');
    fireEvent.change(money, { target: { value: '9 876 543,21' } });
    expect(screen.getByLabelText('raw').textContent).toBe('9876543.21');
    expect(money.value).toBe('9 876 543.21');
    expect((screen.getByLabelText('Quantity') as HTMLInputElement).type).toBe('number');
  });
  it('distinguishes contract money from VAT percentages and quantities in common schemas', () => {
    const type = (entity: string, key: string) => ENTITY_CONFIGS[entity].fields.find(f => f.key === key)?.type;
    expect(type('loyiha', 'byudjet')).toBe('money');
    expect(type('shartnoma', 'summaBezNds')).toBe('money');
    expect(type('shartnoma', 'nds')).toBe('number');
    expect(type('zayavka', 'requestedQty')).toBe('number');
  });
  it('does not leave identifiable monetary fields on native unformatted inputs', () => {
    const root = resolve(process.cwd(), 'src');
    const failures: string[] = [];
    function walk(dir: string) {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = resolve(dir, entry.name);
        if (entry.isDirectory()) { walk(file); continue; }
        if (!file.endsWith('.tsx') || /\.test\.tsx$/.test(file)) continue;
        const text = readFileSync(file, 'utf8');
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
        function visit(n: ts.Node) {
          if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && n.tagName.getText(source) === 'input') {
            const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
            const value = attrs.find(a => ['value', 'defaultValue'].includes(a.name.getText(source)))?.initializer?.getText(source) ?? '';
            // Field value semantics, not nearby labels: codes, quantities and evidence text stay native.
            const monetary = /\b(?:narx\w*|summa\w*|price|prices|amount|cost|jamiNds\w*|aksizSumm\w*|chelStavka|\w+_som|usd_kurs|plLimit|kLimit|misolUsd)\b/i.test(value);
            if (monetary && !/Evidence|source|manba|dalil/i.test(value)) failures.push(`${file}:${source.getLineAndCharacterOfPosition(n.getStart(source)).line + 1} ${value}`);
          }
          ts.forEachChild(n, visit);
        }
        visit(source);
      }
    }
    walk(root);
    expect(failures).toEqual([]);
  });
});

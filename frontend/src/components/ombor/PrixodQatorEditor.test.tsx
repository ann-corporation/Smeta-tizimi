import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { PrixodQatorEditor } from './PrixodQatorEditor';
import { prixodQoralama, qoralamaTasdiqla, qoralamaTasdiqlangan, type PrixodQoralama } from '../../lib/ombor-prixod/qoralama';
import { materialTaklifQur } from '../../lib/ombor-prixod/taklif';
import type { PrixodQator } from '../../lib/ombor-prixod/turlar';

afterEach(cleanup);

function qator(overrides: Partial<PrixodQator> = {}): PrixodQator {
  return {
    manbaQator: 12, manbaRaqam: null, sana: null, nom: '', birlik: '', miqdor: 0, miqdorMatni: '0', tur: '',
    yetkazuvchi: '', hujjat: '', narx: null, summa: null, qqs: null, kalit: null, holat: 'xato',
    xatolar: ['SANA_YOQ', 'NOM_YOQ', 'BIRLIK_YOQ', 'MIQDOR_XATO'], ogohlar: ['YETKAZUVCHI_YOQ'],
    ...overrides,
  };
}

function sourceSuggestions() {
  return materialTaklifQur([
    qator({ manbaQator: 2, nom: 'Щебень', birlik: 'м3', yetkazuvchi: 'Supplier A' }),
    qator({ manbaQator: 3, nom: 'Щебень', birlik: 'т', yetkazuvchi: 'Supplier B' }),
  ]);
}

function TestEditor({ initial, takliflar, onUpdate }: { initial: PrixodQoralama; takliflar: ReturnType<typeof sourceSuggestions>; onUpdate?: (q: PrixodQoralama) => void }) {
  const [draft, setDraft] = useState(initial);
  return <PrixodQatorEditor kompaniyaId={17} qoralama={draft} takliflar={takliflar} onYop={() => undefined}
    onOzgar={(next) => { setDraft(next); onUpdate?.(next); }} />;
}

describe('PrixodQatorEditor', () => {
  it('offers source-backed Щебень/unit/supplier suggestions without silently choosing ambiguous fields', () => {
    render(<TestEditor initial={prixodQoralama(qator())} takliflar={sourceSuggestions()} />);
    const name = screen.getByLabelText('Material nomi') as HTMLInputElement;
    fireEvent.change(name, { target: { value: "she'b" } });
    fireEvent.click(screen.getByRole('button', { name: /^Щебень/ }));
    expect(name.value).toBe('Щебень');

    const unit = screen.getByLabelText('O‘lchov birligi') as HTMLInputElement;
    const supplier = screen.getByLabelText('Yetkazuvchi') as HTMLInputElement;
    expect(unit.value).toBe('');
    expect(supplier.value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'м3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Supplier B' }));
    expect(unit.value).toBe('м3');
    expect(supplier.value).toBe('Supplier B');
  });

  it('reviews all six values, confirms a valid draft, then invalidates confirmation after an edit without changing source', () => {
    const source = qator();
    const sourceBefore = structuredClone(source);
    let latest: PrixodQoralama | undefined;
    render(<TestEditor initial={prixodQoralama(source)} takliflar={[]} onUpdate={(q) => { latest = q; }} />);
    expect(screen.getByText('Ko‘rsatilmagan')).not.toBeNull();
    expect((screen.getByLabelText('Sana') as HTMLInputElement).type).toBe('date');
    expect(screen.getByLabelText('Miqdor').getAttribute('inputmode')).toBe('decimal');

    fireEvent.change(screen.getByLabelText('Sana'), { target: { value: '2026-10-27' } });
    fireEvent.change(screen.getByLabelText('Material nomi'), { target: { value: 'Sement' } });
    fireEvent.change(screen.getByLabelText('O‘lchov birligi'), { target: { value: 'kg' } });
    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '2.5' } });
    fireEvent.change(screen.getByLabelText('Yetkazuvchi'), { target: { value: 'Supplier Z' } });
    fireEvent.change(screen.getByLabelText('Hujjat raqami'), { target: { value: 'DOC-17' } });
    const confirm = screen.getByRole('button', { name: 'Hammasi to‘g‘ri — tasdiqlash' }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(false);
    fireEvent.click(confirm);
    expect(latest && qoralamaTasdiqlangan(latest)).toBe(true);
    expect(latest?.manba).toEqual(sourceBefore);

    fireEvent.change(screen.getByLabelText('Miqdor'), { target: { value: '' } });
    expect(qoralamaTasdiqlangan(latest!)).toBe(false);
    expect(confirm.disabled).toBe(true);
  });

  it('applies bounded voice-to-draft suggestions through the editor change handler and clears approval', () => {
    const original = qator({ sana: '2026-10-27', nom: 'Old material', birlik: 'qop', miqdor: 1, miqdorMatni: '1',
      yetkazuvchi: 'Old supplier', hujjat: 'OLD-1', xatolar: [], ogohlar: [] });
    const approved = qoralamaTasdiqla(prixodQoralama(original));
    expect(qoralamaTasdiqlangan(approved)).toBe(true);
    let latest = approved;
    const catalog = materialTaklifQur([qator({ nom: 'Sement', birlik: 'qop', yetkazuvchi: 'Supplier A' })]);
    render(<TestEditor initial={approved} takliflar={catalog} onUpdate={(next) => { latest = next; }} />);
    fireEvent.click(screen.getByText('Ovoz yoki matndan kirim taklifi'));
    fireEvent.change(screen.getByLabelText('O‘qilgan matn — tahrirlash mumkin'), {
      target: { value: 'Sement 50 qop keldi Supplier A' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Topilgan takliflarni qatorga olish' }));

    expect(latest.maydonlar).toMatchObject({ nom: 'Sement', birlik: 'qop', miqdor: '50', yetkazuvchi: 'Supplier A' });
    expect(latest.tasdiq).toBeNull();
    expect(qoralamaTasdiqlangan(latest)).toBe(false);
  });
});

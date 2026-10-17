import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemberPermissionEditor } from './MemberPermissionEditor';
import { ROLE_PERMISSIONS } from '../../lib/company-authorization/effective-authorization';
import type { AzolikRuxsat } from '../../api/t2-men';
const member:AzolikRuxsat={azolik_id:12,foydalanuvchi_id:31,login:'PTO',ism:'PTO',rol:'pto',qoshimcha_ruxsatlar:[],ruxsat_versiya:4,base_permissions:ROLE_PERMISSIONS.pto as never,effective_permissions:ROLE_PERMISSIONS.pto as never};
afterEach(cleanup);
describe('checkbox constructor',()=>{
  it('inherited approve can be disabled without changing PTO role; save is atomic/versioned',()=>{
    const save=vi.fn();render(<MemberPermissionEditor member={member} companyId={17} pending={false} onSave={save}/>);
    const approve=screen.getByRole('checkbox',{name:/F2 ni tasdiqlash/}) as HTMLInputElement;
    expect(approve.checked).toBe(true);expect(approve.disabled).toBe(false);fireEvent.click(approve);
    expect(save).not.toHaveBeenCalled();expect(screen.getByRole('status').textContent).toContain('Saqlanmagan');
    fireEvent.click(screen.getByRole('button',{name:'Saqlash'}));
    expect(save).toHaveBeenCalledTimes(1);expect(save.mock.calls[0][0]).toMatchObject({kompaniya_id:17,azolik_id:12,expected_version:4,permissions:{'f2.approve':false,'f2.prepare':true}});
    expect(save.mock.calls[0][0].operation_id).toMatch(/^[a-f0-9-]{36}$/);
  });
  it('cancel restores values without an API write',()=>{
    const save=vi.fn();render(<MemberPermissionEditor member={member} companyId={17} pending={false} onSave={save}/>);
    fireEvent.click(screen.getByRole('checkbox',{name:/F2 ni tasdiqlash/}));fireEvent.click(screen.getByRole('button',{name:'Bekor qilish'}));
    expect((screen.getByRole('checkbox',{name:/F2 ni tasdiqlash/}) as HTMLInputElement).checked).toBe(true);expect(save).not.toHaveBeenCalled();
  });
  it('superadmin/boss authority has no editable checkboxes',()=>{
    render(<MemberPermissionEditor member={{...member,protected:true}} companyId={17} pending={false} onSave={vi.fn()}/>);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
  it('pending command prevents duplicate saves and toggles',()=>{
    render(<MemberPermissionEditor member={member} companyId={17} pending={true} onSave={vi.fn()}/>);
    expect(screen.getAllByRole('checkbox').every(x=>(x as HTMLInputElement).disabled)).toBe(true);
  });
  it('background role/permission change cannot replace an unsaved draft or silently overwrite the newer version',()=>{
    const save=vi.fn(); const view=render(<MemberPermissionEditor member={member} companyId={17} pending={false} onSave={save}/>);
    fireEvent.click(screen.getByRole('checkbox',{name:/F2 ni tasdiqlash/}));
    view.rerender(<MemberPermissionEditor member={{...member,ruxsat_versiya:5}} companyId={17} pending={false} onSave={save}/>);
    expect(screen.getByRole('alert').textContent).toContain('Boshqa boshqaruvchi');
    expect((screen.getByRole('button',{name:'Saqlash'}) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('checkbox',{name:/F2 ni tasdiqlash/}) as HTMLInputElement).checked).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
});

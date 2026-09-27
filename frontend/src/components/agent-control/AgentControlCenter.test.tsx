import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentControlCenter } from './AgentControlCenter';
import type { AgentControlReadModel } from '../../lib/agent-control-plane';

afterEach(cleanup);

const data: AgentControlReadModel = {
  ok: true,
  scope: 'company',
  agents: [{ kod: 'pto_smeta', nom: 'PTO agent', rol: 'pto', permission_mode: 'human_approval_required', allowed_commands: ['f2.draft.prepare'], allowed_tools: ['f2.read'], default_scope: 'company', holat: 'active', versiya: 1 }],
  runs: [{ run_id: 7, operation_id: 'hidden', agent_kod: 'pto_smeta', command_kod: 'f2.draft.prepare', holat: 'approval_required', kompaniya_id: 12, loyiha_id: null, obyekt_id: null, versiya: 1, created_at: '2026-09-27T00:00:00Z', updated_at: '2026-09-27T00:00:00Z' }],
  approvals: [{ run_id: 7, holat: 'pending', requested_at: '2026-09-27T00:00:00Z', sabab: 'F2 qoralamasi' }],
};

describe('AgentControlCenter', () => {
  it('does not show technical operation identity and renders approval state', () => {
    render(<AgentControlCenter data={data} />);
    expect(screen.getByText('Agentlar boshqaruvi')).toBeTruthy();
    expect(screen.getByText('Tasdiq kerak')).toBeTruthy();
    expect(screen.getByText('Tasdiqlash')).toBeTruthy();
    expect(screen.queryByText('hidden')).toBeNull();
  });

  it('keeps approval decisions as typed callbacks', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(<AgentControlCenter data={data} onApprove={onApprove} onReject={onReject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Tasdiqlash' }));
    expect(onApprove).toHaveBeenCalledWith(data.approvals[0], data.runs[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Rad etish' }));
    expect(onReject).toHaveBeenCalledWith(data.approvals[0], data.runs[0]);
  });

  it('fails closed with a user-safe error', () => {
    render(<AgentControlCenter error="PGRST202 internal" />);
    expect(screen.getByRole('alert').textContent).toContain('yuklab bo‘lmadi');
    expect(screen.getByRole('alert').textContent).not.toContain('PGRST202');
  });
});

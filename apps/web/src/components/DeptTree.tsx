import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { Department } from '../types';

export default function DeptTree({ depts, selectedId, onSelect }: { depts: Department[]; selectedId: string | null; onSelect: (id: string | null) => void }) {
  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelect(null)}
        className={`w-full h-9 px-2.5 rounded-md flex items-center justify-between text-xs transition-colors ${selectedId === null ? 'font-medium status-primary border-0' : 'muted hover-surface'}`}
      >
        <span>全部成员</span>
      </button>
      {depts.map((department) => <DepartmentNode key={department.deptId} department={department} selectedId={selectedId} onSelect={onSelect} depth={0} />)}
    </div>
  );
}

function DepartmentNode({ department, selectedId, onSelect, depth }: { department: Department; selectedId: string | null; onSelect: (id: string) => void; depth: number }) {
  const hasChildren = department.children.length > 0;
  const selected = selectedId === department.deptId;
  const containsSelected = containsDepartment(department, selectedId);
  const [open, setOpen] = useState(containsSelected);

  useEffect(() => { if (containsSelected) setOpen(true); }, [containsSelected]);

  return (
    <div>
      <div className={`flex items-center rounded-md transition-colors ${selected ? 'status-primary border-0' : 'hover-surface'}`}>
        <button
          type="button"
          onClick={() => hasChildren && setOpen((value) => !value)}
          className="w-7 h-9 inline-flex items-center justify-center shrink-0"
          aria-label={open ? '收起部门' : '展开部门'}
          style={{ color: 'var(--text-muted)', marginLeft: `${depth * 12}px` }}
        >
          {hasChildren ? open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" /> : <span className="w-3.5" />}
        </button>
        <button onClick={() => onSelect(department.deptId)} className={`h-9 min-w-0 flex-1 pr-2 flex items-center justify-between gap-2 text-xs ${selected ? 'font-medium' : 'muted'}`}>
          <span className="truncate">{department.deptName}</span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{department.memberCount}</span>
        </button>
      </div>
      {open && hasChildren && department.children.map((child) => <DepartmentNode key={child.deptId} department={child} selectedId={selectedId} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  );
}

function containsDepartment(department: Department, selectedId: string | null): boolean {
  if (!selectedId) return false;
  return department.deptId === selectedId || department.children.some((child) => containsDepartment(child, selectedId));
}

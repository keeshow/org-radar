import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, FolderTree, Search, UserRound, Users } from 'lucide-react';
import { api } from '../api';
import type { Department, Person } from '../types';
import DeptTree from '../components/DeptTree';
import PersonDrawer from '../components/PersonDrawer';

const avatarTones = [
  'bg-blue-50/80 text-blue-600 dark:bg-blue-400/12 dark:text-blue-300',
  'bg-emerald-50/80 text-emerald-600 dark:bg-emerald-400/12 dark:text-emerald-300',
  'bg-amber-50/80 text-amber-600 dark:bg-amber-400/12 dark:text-amber-300',
  'bg-cyan-50/80 text-cyan-600 dark:bg-cyan-400/12 dark:text-cyan-300',
  'bg-rose-50/80 text-rose-600 dark:bg-rose-400/12 dark:text-rose-300',
  'bg-sky-50/80 text-sky-600 dark:bg-sky-400/12 dark:text-sky-300',
];

export default function Contacts() {
  const [searchParams] = useSearchParams();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [persons, setPersons] = useState<Person[]>([]);
  const [selectedDept, setSelectedDept] = useState<string | null>(searchParams.get('dept'));
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getDepartments().then(setDepartments).catch(console.error); }, []);
  useEffect(() => {
    setSelectedDept(searchParams.get('dept'));
    setSearch(searchParams.get('search') || '');
  }, [searchParams]);

  const loadPersons = useCallback(async () => {
    setLoading(true);
    try {
      const next = await api.getContacts({
        deptId: selectedDept || undefined,
        search: search || undefined,
        scope: selectedDept && !search ? 'direct' : 'tree',
      });
      setPersons(next);
    } finally {
      setLoading(false);
    }
  }, [selectedDept, search]);

  useEffect(() => { loadPersons(); }, [loadPersons]);

  const selectedDepartment = selectedDept ? findDepartment(departments, selectedDept) : null;
  const showSubgroups = !!selectedDepartment && selectedDepartment.children.length > 0 && !search;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_340px] gap-4 items-start lg:h-[calc(100vh-104px)]">
      <aside className="surface overflow-hidden lg:h-full">
        <div className="h-12 px-4 flex items-center justify-between border-b divider">
          <div className="flex items-center gap-2"><FolderTree className="w-4 h-4" style={{ color: 'var(--primary)' }} /><span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>组织结构</span></div>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{departments.length} 部门</span>
        </div>
        <div className="lg:h-[calc(100%_-_48px)] max-h-[calc(100vh-150px)] overflow-y-auto p-2">
          <DeptTree depts={departments} selectedId={selectedDept} onSelect={(id) => { setSelectedDept(id); setSelectedPerson(null); }} />
        </div>
      </aside>

      <section className="surface overflow-hidden min-w-0 lg:h-full flex flex-col">
        <div className="shrink-0 px-4 py-3 border-b divider" style={{ background: 'var(--surface)' }}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={selectedDepartment ? `在 ${selectedDepartment.deptName} 中搜索` : '搜索姓名、职位、工号或部门'}
              className="control w-full h-10 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        {showSubgroups && (
          <div className="shrink-0 px-4 py-4 border-b divider surface-subtle">
            <div className="flex items-center justify-between mb-3">
              <p className="section-kicker">子分类小组</p>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{selectedDepartment.children.length} 个</span>
            </div>
            <div className="grid sm:grid-cols-2 2xl:grid-cols-3 gap-2">
              {selectedDepartment.children.map((department) => (
                <button
                  key={department.deptId}
                  onClick={() => { setSelectedDept(department.deptId); setSelectedPerson(null); }}
                  className="hover-surface px-3 py-2.5 text-left rounded-md border transition-colors"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--text-main)' }}>{department.deptName}</span>
                    <ChevronRight className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>{department.memberCount} 人{department.children.length > 0 ? ` · ${department.children.length} 个下级组` : ''}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="shrink-0 h-10 px-4 flex items-center justify-between border-b divider" style={{ background: 'var(--surface)' }}>
          <div className="flex items-center gap-2 text-xs muted">
            <Users className="w-3.5 h-3.5" />
            <span>{selectedDepartment && !search ? '直属人员' : search ? '搜索结果' : '全部成员'}</span>
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{persons.length} 人</span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div className="h-full min-h-64 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>正在读取人员…</div>
        ) : persons.length === 0 ? (
          <div className="h-full min-h-64 flex flex-col items-center justify-center text-sm" style={{ color: 'var(--text-muted)' }}>
            <UserRound className="w-7 h-7 mb-2" />
            <p>{showSubgroups ? '当前分类暂无直属人员，请进入子组查看' : '未找到匹配人员'}</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {persons.map((person) => {
              const selected = selectedPerson === person.userId;
              return (
                <button
                  key={person.userId}
                  onClick={() => setSelectedPerson(person.userId)}
                  className={`w-full px-4 py-3 flex items-center gap-3 text-left transition-colors ${selected ? 'status-primary border-0' : 'hover-surface'}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${avatarTone(person.name)}`}>{person.name.charAt(0)}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-main)' }}>{person.name}</span>
                      {person.title && <span className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{person.title}</span>}
                    </div>
                    <p className="mt-0.5 text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>{person.departments[0]?.deptPath || '未关联部门'}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: selected ? 'var(--primary)' : 'var(--text-muted)' }} />
                </button>
              );
            })}
          </div>
        )}
        </div>
      </section>

      <div className="hidden xl:block h-full">
        {selectedPerson ? (
          <PersonDrawer userId={selectedPerson} onClose={() => setSelectedPerson(null)} mode="panel" />
        ) : (
          <aside className="surface h-full flex flex-col items-center justify-center px-8 text-center">
            <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-subtle)' }}><UserRound className="w-5 h-5" style={{ color: 'var(--text-muted)' }} /></div>
            <p className="mt-3 text-sm font-medium" style={{ color: 'var(--text-main)' }}>选择一名成员</p>
            <p className="mt-1 text-xs leading-5" style={{ color: 'var(--text-muted)' }}>人员档案、联系方式与变化日志将在这里持续展示</p>
          </aside>
        )}
      </div>

      {selectedPerson && <div className="xl:hidden"><PersonDrawer userId={selectedPerson} onClose={() => setSelectedPerson(null)} /></div>}
    </div>
  );
}

function findDepartment(departments: Department[], id: string): Department | null {
  for (const department of departments) {
    if (department.deptId === id) return department;
    const found = findDepartment(department.children, id);
    if (found) return found;
  }
  return null;
}

function avatarTone(name: string) {
  let hash = 0;
  for (const char of name) hash = char.charCodeAt(0) + ((hash << 5) - hash);
  return avatarTones[Math.abs(hash) % avatarTones.length];
}

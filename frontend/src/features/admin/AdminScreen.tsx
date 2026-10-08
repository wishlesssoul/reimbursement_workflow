import { useEffect, useState } from 'react';
import { fetchAdminUsers, seedDemoData } from '../../api';
import type { AdminUser } from '../../types';

interface AdminScreenProps {
  onMessage: (message: string) => void;
  onSeeded: () => void;
}

export default function AdminScreen({ onMessage, onSeeded }: AdminScreenProps) {
  const [users, setUsers] = useState<AdminUser[]>([]);

  useEffect(() => {
    fetchAdminUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  async function handleSeed() {
    try {
      const result = await seedDemoData();
      onMessage(result.message);
      setUsers(await fetchAdminUsers());
      onSeeded();
    } catch (error) {
      onMessage(error instanceof Error ? error.message : 'Seed failed.');
    }
  }

  return (
    <section className="panel admin-users-panel">
      <h3>Users</h3>
      {users.length === 0 ? (
        <p>No users available.</p>
      ) : (
        <ul className="item-list">
          {users.map((user) => (
            <li key={user.id}>
              <strong>{user.full_name}</strong>
              <span className="status-pill">{user.role}</span>
              <small>{user.email}</small>
            </li>
          ))}
        </ul>
      )}
      <button className="secondary" onClick={handleSeed}>Seed demo data</button>
    </section>
  );
}
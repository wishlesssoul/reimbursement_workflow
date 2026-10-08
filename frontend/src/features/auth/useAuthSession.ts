import { type FormEvent, useEffect, useState } from 'react';
import { fetchCurrentUser, loginUser, logoutUser } from '../../api';
import type { User } from '../../types';

export default function useAuthSession() {
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem('user');
    return storedUser ? (JSON.parse(storedUser) as User) : null;
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'));
  const [email, setEmail] = useState('customer1@example.com');
  const [password, setPassword] = useState('Password123!');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!token) return;

    fetchCurrentUser().then((result) => setUser(result.user)).catch(() => {
      setUser(null);
      setToken(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    });
  }, [token]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('');

    try {
      const result = await loginUser(email, password);
      setUser(result.user);
      setToken(result.token);
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      setMessage(`Logged in as ${result.user.role}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed.');
    }
  }

  async function logout() {
    let logoutMessage = 'Logged out.';
    try {
      await logoutUser();
    } catch {
      logoutMessage = 'Local session cleared. The server session could not be revoked.';
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setMessage(logoutMessage);
  }

  return {
    user,
    message,
    setMessage,
    email,
    setEmail,
    password,
    setPassword,
    login,
    logout,
  };
}
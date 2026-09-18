import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth';

export function LoginForm() {
  const pending = useAuthStore((s) => s.pending);
  const login = useAuthStore((s) => s.login);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await login({ email: email.trim(), password });
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-2.5"
    >
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Почта"
        autoComplete="email"
        className="h-10 rounded-xl px-3"
        required
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        autoComplete="current-password"
        className="h-10 rounded-xl px-3"
        required
      />
      <Button type="submit" disabled={pending} className="h-10 w-full rounded-xl">
        {pending ? 'Вхожу…' : 'Войти'}
      </Button>
    </form>
  );
}

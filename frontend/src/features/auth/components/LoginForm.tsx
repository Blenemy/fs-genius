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
      className="flex flex-col gap-3"
    >
      <Input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Почта"
        autoComplete="email"
        required
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        autoComplete="current-password"
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Вхожу…' : 'Войти'}
      </Button>
    </form>
  );
}

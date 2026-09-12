import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/stores/auth';
import { NAME_MAX, PASSWORD_MIN } from '../types';

export function RegisterForm() {
  const pending = useAuthStore((s) => s.pending);
  const register = useAuthStore((s) => s.register);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await register({ name: name.trim(), email: email.trim(), password });
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="flex flex-col gap-3"
    >
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Имя"
        maxLength={NAME_MAX}
        autoComplete="name"
        required
      />
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
        placeholder={`Пароль, минимум ${PASSWORD_MIN} символов`}
        autoComplete="new-password"
        minLength={PASSWORD_MIN}
        required
      />
      <Button type="submit" disabled={pending}>
        {pending ? 'Создаю…' : 'Зарегистрироваться'}
      </Button>
    </form>
  );
}

import { AlertCircle } from 'lucide-react';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';

export default function NotFound() {
  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center bg-[var(--out-bg)] p-4 font-mono">
      <Sheet dwgNo="ERR-404" rev="F" className="w-full max-w-md mx-4">
        <div className="flex flex-col items-center text-center p-8">
          <AlertCircle className="h-16 w-16 text-[var(--out-danger)] mb-6" />
          <h1 className="text-2xl font-bold text-[var(--out-danger)] uppercase tracking-[0.08em] mb-2">
            SYSTEM FAULT 404
          </h1>
          <p className="text-[var(--out-muted)] uppercase text-xs mb-8">
            THE REQUESTED DATUM COULD NOT BE LOCATED IN THE CURRENT BLOCK REGISTRY.
          </p>
          <Link href="/">
            <Button variant="outline" className="w-full">
              RETURN TO TERMINAL
            </Button>
          </Link>
        </div>
      </Sheet>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import logo from '@/assets/logo.png';
import { validateUsername } from '@/lib/usernameValidation';

function generateUsernameSuggestions(firstName: string, lastName: string): string[] {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !l) return [];
  const rand = () => Math.floor(Math.random() * 999);
  return [
    `${f}_${l}`.slice(0, 20),
    `${f}${l}`.slice(0, 20),
    `${f}_${l}${rand()}`.slice(0, 20),
    `${l}_${f}`.slice(0, 20),
  ].filter(u => u.length >= 6);
}

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);

  // Generate suggestions when names change
  useEffect(() => {
    if (isSignUp && firstName && lastName) {
      setSuggestions(generateUsernameSuggestions(firstName, lastName));
    }
  }, [firstName, lastName, isSignUp]);

  // Check username availability
  useEffect(() => {
    if (!username || username.length < 6) { setUsernameAvailable(null); return; }
    const timer = setTimeout(async () => {
      setCheckingUsername(true);
      const { data } = await supabase.from('profiles_public').select('id').eq('username', username.trim()).maybeSingle();
      setUsernameAvailable(!data);
      setCheckingUsername(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [username]);

  const ALLOWED_DOMAINS = ['gmail.com', 'icloud.com', 'yahoo.com'];

  const handleSendOtp = async () => {
    if (!email) { toast.error('Please enter your email'); return; }
    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain || !ALLOWED_DOMAINS.includes(domain)) {
      toast.error('Only Gmail, iCloud, and Yahoo email addresses are allowed');
      return;
    }
    if (isSignUp) {
      if (!firstName.trim() || !lastName.trim()) { toast.error('Please enter your full name'); return; }
      const usernameError = validateUsername(username);
      if (usernameError) { toast.error(usernameError); return; }
      if (usernameAvailable === false) { toast.error('Username is already taken'); return; }
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: isSignUp ? {
            username: username.trim(),
            first_name: firstName.trim(),
            last_name: lastName.trim(),
          } : undefined,
        },
      });
      if (error) throw error;
      setStep('otp');
      toast.success('Check your email for the verification code!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) { toast.error('Please enter all 6 digits'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
      if (error) throw error;
      toast.success('Welcome to Kanisa Kiganjani!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Invalid OTP code');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md shadow-card">
        <CardHeader className="text-center space-y-4">
          <div className="flex justify-center">
            <img src={logo} alt="Kanisa Kiganjani" className="w-24 h-24 rounded-2xl" />
          </div>
          <CardTitle className="text-2xl" style={{ fontFamily: 'var(--font-heading)' }}>
            {step === 'email' ? (isSignUp ? 'Join Kanisa Kiganjani' : 'Welcome Back') : 'Verify Your Email'}
          </CardTitle>
          <CardDescription>
            {step === 'email' ? 'Enter your email to receive a verification code' : `We sent a 6-digit code to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'email' ? (
            <>
              {isSignUp && (
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <Input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              )}
              <Input type="email" placeholder="Your email address" value={email} onChange={(e) => setEmail(e.target.value)} />
              {isSignUp && (
                <div className="space-y-2">
                  <div className="relative">
                    <Input
                      type="text"
                      placeholder="Choose a username (6-20 characters)"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      maxLength={20}
                    />
                    {username.length >= 6 && !checkingUsername && usernameAvailable !== null && (
                      <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-xs ${usernameAvailable ? 'text-green-600' : 'text-destructive'}`}>
                        {usernameAvailable ? '✓ Available' : '✗ Taken'}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Letters, numbers, and _ only. 6-20 characters.</p>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <span className="text-xs text-muted-foreground">Suggestions:</span>
                      {suggestions.map(s => (
                        <button key={s} onClick={() => setUsername(s)}
                          className="text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground hover:bg-primary hover:text-primary-foreground transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <Button onClick={handleSendOtp} disabled={loading} className="w-full">
                {loading ? 'Sending...' : 'Send Verification Code'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary font-semibold hover:underline">
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
              <p className="text-center text-xs text-muted-foreground">
                By continuing, you agree to our{' '}
                <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>
              </p>
            </>
          ) : (
            <>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} /><InputOTPSlot index={1} /><InputOTPSlot index={2} />
                    <InputOTPSlot index={3} /><InputOTPSlot index={4} /><InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={handleVerifyOtp} disabled={loading} className="w-full">
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </Button>
              <button onClick={() => { setStep('email'); setOtp(''); }}
                className="w-full text-center text-sm text-muted-foreground hover:underline">
                Use a different email
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import logo from '@/assets/logo.png';

const Auth = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [step, setStep] = useState<'email' | 'otp'>('email');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSendOtp = async () => {
    if (!email) {
      toast.error('Please enter your email');
      return;
    }
    if (isSignUp && !username) {
      toast.error('Please enter a username');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          data: isSignUp ? { username } : undefined,
        },
      });
      if (error) throw error;
      setStep('otp');
      toast.success('Check your email for the verification code!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      toast.error('Please enter all 6 digits');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });
      if (error) throw error;
      toast.success('Welcome to Kanisa Kiganjani!');
      navigate('/');
    } catch (err: any) {
      toast.error(err.message || 'Invalid OTP code');
    } finally {
      setLoading(false);
    }
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
            {step === 'email'
              ? 'Enter your email to receive a verification code'
              : `We sent a 6-digit code to ${email}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'email' ? (
            <>
              <Input
                type="email"
                placeholder="Your email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {isSignUp && (
                <Input
                  type="text"
                  placeholder="Choose a username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              )}
              <Button onClick={handleSendOtp} disabled={loading} className="w-full">
                {loading ? 'Sending...' : 'Send Verification Code'}
              </Button>
              <p className="text-center text-sm text-muted-foreground">
                {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-primary font-semibold hover:underline"
                >
                  {isSignUp ? 'Sign In' : 'Sign Up'}
                </button>
              </p>
            </>
          ) : (
            <>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={handleVerifyOtp} disabled={loading} className="w-full">
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </Button>
              <button
                onClick={() => { setStep('email'); setOtp(''); }}
                className="w-full text-center text-sm text-muted-foreground hover:underline"
              >
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

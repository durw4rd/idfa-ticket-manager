'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Plus, RefreshCw } from 'lucide-react';
import type { CrewMember, Group } from '@/lib/types';
import { onboardingSteps, type OnboardingStep } from '@/lib/onboarding';
import { readApiResponse } from '@/lib/api-client';
import IDFALogo from '@/components/IDFALogo';
import PendingInvites from '@/components/PendingInvites';
import ProfileCard from '@/components/ProfileCard';
import ForwardingCard from '@/components/ForwardingCard';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { inputClasses, Notice } from '@/components/ui/Field';
import Tour from './Tour';

/**
 * The first-run walkthrough (/welcome), one step at a time. Joining, the profile and new groups save
 * as they happen; finishing or skipping marks the flow done, so the Agenda stops sending them here.
 */
export default function Welcome({
  groups: initialGroups,
  crew,
  email,
  allowedWithoutGroups,
  forwarding,
  crewScreenings,
  hasOwnTickets,
}: {
  groups: Group[];
  crew: CrewMember[];
  email: string;
  allowedWithoutGroups: boolean;
  // Your address for forwarding IDFA's voting emails, and Gmail's confirm link once it arrives;
  // null where inbound mail isn't set up
  forwarding: { address: string; confirmUrl: string | null } | null;
  crewScreenings: number; // This year's screenings the viewer can see, theirs and their crew's
  hasOwnTickets: boolean;
}) {
  const router = useRouter();
  // Fixed when the flow opens: joining a group mustn't make the crew step vanish under them
  const [steps] = useState(() => onboardingSteps(initialGroups, { voting: !!forwarding }));
  const [index, setIndex] = useState(0);
  // Kept here too, so a join shows at once rather than when the refreshed page data arrives
  const [groups, setGroups] = useState(initialGroups);
  const [finishing, setFinishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const step: OnboardingStep = steps[index];
  const [refreshing, startRefresh] = useTransition();
  const me = crew.find((member) => member.isMe)!;
  // What's typed in the profile step's name field, saved by Continue if it wasn't saved already
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  // Set once they move between steps; from then on each new step's heading takes focus
  const [moved, setMoved] = useState(false);
  const goTo = (i: number) => {
    setMoved(true);
    setError(null); // An error belongs to the step it happened on
    setNameDraft(null); // The profile step's field starts from the saved name when shown again
    setIndex(Math.max(0, Math.min(i, steps.length - 1)));
  };
  const next = () => goTo(index + 1);

  const [savingName, setSavingName] = useState(false);
  const continueFromProfile = async () => {
    if (nameDraft === null || nameDraft.trim() === me.name) {
      next();
      return;
    }
    setSavingName(true);
    setError(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameDraft.trim() }),
      });
      await readApiResponse(response, 'Could not save your name');
      setNameDraft(null);
      router.refresh();
      next();
    } catch (err) {
      // Stays on the step, name and all, with the error under the header
      setError(err instanceof Error ? err.message : 'Could not save your name');
    } finally {
      setSavingName(false);
    }
  };

  const finish = async (to: string) => {
    setFinishing(to);
    setError(null);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onboarded: true }),
      });
      await readApiResponse(response, 'Could not save that you are done');
      router.push(to);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that you are done');
      setFinishing(null);
    }
  };

  return (
    <div className="flex min-h-dvh flex-col pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-safe">
      <header className="flex h-14 items-center gap-3">
        {index > 0 ? (
          <Button
            variant="ghost"
            size="icon"
            className="-ml-3"
            aria-label="Back"
            icon={<ArrowLeft className="h-5 w-5" />}
            onClick={() => goTo(index - 1)}
          />
        ) : (
          <IDFALogo className="h-7 w-auto" />
        )}
        <ol className="flex flex-1 justify-center gap-1.5" aria-label={`Step ${index + 1} of ${steps.length}`}>
          {steps.map((s, i) => (
            <li
              key={s}
              aria-hidden
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-ink' : i < index ? 'w-1.5 bg-ink-2' : 'w-1.5 bg-line-strong'}`}
            />
          ))}
        </ol>
        <Button
          variant="ghost"
          size="sm"
          className="-mr-3 text-ink-2"
          disabled={!!finishing}
          onClick={() => finish('/screenings')}
        >
          Skip
        </Button>
      </header>

      {/* Here rather than in a step: Skip can fail from any of them */}
      {error && (
        <div className="pt-2">
          <Notice>{error}</Notice>
        </div>
      )}

      <div className="flex flex-1 flex-col pt-6">
        {step === 'crew' && (
          <CrewStep
            groups={groups}
            crew={crew}
            allowedWithoutGroups={allowedWithoutGroups}
            onGroupsChange={setGroups}
            onNext={next}
            focus={moved}
          />
        )}

        {step === 'profile' && (
          <StepLayout
            focus={moved}
            title="How your crew sees you"
            intro="Your name and badge show on the agenda, on tickets you hold and next to your ratings."
            footer={
              <Button
                className="w-full"
                disabled={savingName}
                icon={savingName ? <Loader2 className="h-5 w-5 animate-spin" /> : undefined}
                onClick={continueFromProfile}
              >
                Continue
              </Button>
            }
          >
            <ProfileCard me={me} crew={crew} email={email} showSignOut={false} onNameDraft={setNameDraft} />
          </StepLayout>
        )}

        {step === 'tour' && (
          <StepLayout
            focus={moved}
            title="What's in the app"
            intro="Three tabs at the bottom, one for each job."
            footer={<Button className="w-full" onClick={next}>Continue</Button>}
          >
            <Tour />
          </StepLayout>
        )}

        {step === 'voting' && forwarding && (
          <StepLayout
            focus={moved}
            title="Vote for the Audience Award"
            intro="After each screening IDFA emails a voting link per ticket, to whoever bought them. Have Gmail forward those emails here and each link shows up in the app for whoever holds the ticket, so the whole crew can vote."
            footer={
              <div className="space-y-2">
                <Button className="w-full" onClick={next}>
                  Continue
                </Button>
                <p className="text-center text-xs text-ink-3">You can also set this up later on the Crew page.</p>
              </div>
            }
          >
            <ForwardingCard address={forwarding.address} confirmUrl={forwarding.confirmUrl} spareLinks={[]} showHeading={false} />
            {!forwarding.confirmUrl && (
              // Gmail's confirmation mail takes a minute; this picks it up without leaving the flow
              <Button
                variant="ghost"
                size="sm"
                className="-ml-3 text-ink-2"
                icon={<RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />}
                disabled={refreshing}
                onClick={() => startRefresh(() => router.refresh())}
              >
                Added the address in Gmail? Check for its confirmation
              </Button>
            )}
          </StepLayout>
        )}

        {step === 'tickets' && (
          <StepLayout
            focus={moved}
            title={hasOwnTickets ? "You're all set" : 'Add your tickets'}
            intro={
              hasOwnTickets
                ? 'Your tickets are in. Add more any time with the + at the top of the Agenda.'
                : 'Upload the PDFs from your IDFA order. Every page becomes a ticket with its QR code, and your agenda builds itself.'
            }
            footer={
              <div className="space-y-2">
                {hasOwnTickets ? (
                  <Button
                    className="w-full"
                    disabled={!!finishing}
                    icon={finishing ? <Loader2 className="h-5 w-5 animate-spin" /> : undefined}
                    onClick={() => finish('/screenings')}
                  >
                    Go to the agenda
                  </Button>
                ) : (
                  <>
                    <Button
                      className="w-full"
                      disabled={!!finishing}
                      icon={
                        finishing === '/upload' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                          <Plus className="h-5 w-5" />
                        )
                      }
                      onClick={() => finish('/upload')}
                    >
                      Upload tickets
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      disabled={!!finishing}
                      onClick={() => finish('/screenings')}
                    >
                      Later
                    </Button>
                  </>
                )}
              </div>
            }
          >
            {crewScreenings > 0 && !hasOwnTickets && (
              <p className="rounded border border-line bg-surface p-4 text-sm text-ink-2">
                Your crew already has {crewScreenings} {crewScreenings === 1 ? 'screening' : 'screenings'} this year.
                They&apos;re waiting on the Agenda, and yours join them once you upload.
              </p>
            )}
          </StepLayout>
        )}
      </div>
    </div>
  );
}

function StepLayout({
  title,
  intro,
  children,
  footer,
  focus = false,
}: {
  title: string;
  intro: string;
  children?: React.ReactNode;
  footer: React.ReactNode;
  focus?: boolean; // Move focus to the heading when shown, so screen readers announce the new step
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) heading.current?.focus();
    // Only when this step appears: a later prop change mustn't pull focus out of a form
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <div className="flex-1 space-y-6">
        <div>
          <h1 ref={heading} tabIndex={-1} className="font-display text-xl text-balance focus:outline-none">
            {title}
          </h1>
          <p className="mt-2 text-ink-2">{intro}</p>
        </div>
        {children}
      </div>
      <div className="pt-8">{footer}</div>
    </>
  );
}

/**
 * Join the crew you were invited to; or, with no invite and no group, start one or go on alone.
 * Once you're in a group it says who's there.
 */
function CrewStep({
  groups,
  crew,
  allowedWithoutGroups,
  onGroupsChange,
  onNext,
  focus,
}: {
  groups: Group[];
  crew: CrewMember[];
  allowedWithoutGroups: boolean;
  onGroupsChange: (groups: Group[]) => void;
  onNext: () => void;
  focus: boolean;
}) {
  const router = useRouter();
  // Joining or creating swaps this step's content; its heading then takes focus too
  const [acted, setActed] = useState(false);
  const changeGroups = (next: Group[]) => {
    setActed(true);
    onGroupsChange(next);
  };
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invites = groups.filter((group) => group.status === 'invited');
  const active = groups.filter((group) => group.status === 'active');
  // Others in your groups; the crew prop catches up after the page data refreshes
  const others = crew.filter((member) => !member.isMe);

  const createGroup = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', name: name.trim() }),
      });
      const data = await readApiResponse<{ groups: Group[] }>(response, 'Could not create the group');
      changeGroups(data.groups);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the group');
    } finally {
      setBusy(false);
    }
  };

  if (invites.length > 0) {
    return (
      <StepLayout
        key="invites" // A new element per branch, so its heading takes focus
        focus={focus || acted}
        title={invites.length === 1 ? 'Join your crew' : 'Join your crews'}
        intro="You've been invited to share the festival. Once you join, you'll see each other's screenings, tickets and ratings in one agenda."
        footer={
          <Button variant="ghost" className="w-full" onClick={onNext}>
            {active.length > 0 ? 'Continue' : 'Decide later'}
          </Button>
        }
      >
        <PendingInvites
          groups={groups}
          crew={crew}
          allowedWithoutGroups={allowedWithoutGroups}
          onChange={changeGroups}
        />
        {active.length > 0 && <InGroups groups={active} others={others} />}
      </StepLayout>
    );
  }

  if (active.length > 0) {
    return (
      <StepLayout
        key="in-group" // A new element per branch, so its heading takes focus
        focus={focus || acted}
        title="You're in"
        intro="Everyone in your crew sees each other's screenings, tickets and ratings. You can hand a ticket to anyone in it."
        footer={<Button className="w-full" onClick={onNext}>Continue</Button>}
      >
        <InGroups groups={active} others={others} />
      </StepLayout>
    );
  }

  return (
    <StepLayout
      key="start" // A new element per branch, so its heading takes focus
      focus={focus || acted}
      title="Start a crew"
      intro="The app is made for going to the festival together: everyone in a group sees each other's screenings and tickets. Start one and invite friends from the Crew page, or ask a friend to invite you."
      footer={
        <Button variant="ghost" className="w-full" onClick={onNext}>
          Continue on my own
        </Button>
      }
    >
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim()) createGroup();
        }}
      >
        <input
          type="text"
          placeholder="e.g. Festival friends"
          aria-label="New group name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          className={`${inputClasses} min-w-0 flex-1`}
        />
        <Button
          type="submit"
          variant="secondary"
          disabled={busy || !name.trim()}
          icon={busy ? <Loader2 className="h-4 w-4 animate-spin" /> : undefined}
        >
          Create
        </Button>
      </form>
      {error && <Notice>{error}</Notice>}
    </StepLayout>
  );
}

function InGroups({ groups, others }: { groups: Group[]; others: CrewMember[] }) {
  return (
    <div className="rounded border border-line bg-surface p-4">
      <p className="label">You&apos;re in</p>
      <p className="mt-1 font-display text-lg">{groups.map((group) => group.name).join(', ')}</p>
      {others.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-3">
          {others.map((member) => (
            <div key={member.email} className="flex items-center gap-2">
              <Avatar member={member} size="md" />
              <span className="text-sm">{member.name}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-ink-2">
          Just you so far. Invite friends from the Crew page: tap your avatar at the top of any screen.
        </p>
      )}
    </div>
  );
}

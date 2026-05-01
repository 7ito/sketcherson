import { formatShellCopy } from '@sketcherson/common/game';
import { censorProfanity } from '@sketcherson/common/moderation';
import type { ChatMessage, RoomFeedItem } from '@sketcherson/common/room';
import type { ReactNode } from 'react';
import { GAME_DEFINITION, GAME_WEB_CONFIG } from '../../game';
import { getPlayerAccentStyle } from './helpers';

export function legacyChatMessagesToRoomFeed(messages: readonly ChatMessage[] | undefined): RoomFeedItem[] {
  return (messages ?? []).flatMap((message): RoomFeedItem[] => {
    const base = {
      id: message.id,
      createdAt: message.createdAt,
      turnNumber: message.turnNumber ?? null,
    };

    if (message.kind === 'message' && message.senderPlayerId && message.senderNickname) {
      return [{
        ...base,
        type: 'playerChat',
        senderPlayerId: message.senderPlayerId,
        senderNickname: message.senderNickname,
        text: message.text,
      }];
    }

    if (message.kind === 'correctGuess' || message.kind === 'otherCorrectGuess') {
      return [{
        ...base,
        type: 'correctGuess',
        visibility: message.kind === 'correctGuess' ? 'self' : 'others',
        guesserPlayerId: message.kind === 'correctGuess' ? null : message.senderPlayerId,
        guesserNickname: message.kind === 'correctGuess' ? null : message.senderNickname,
      }];
    }

    return [];
  });
}

function formatFeedCopy(template: string, tokens: Record<string, string | number | null | undefined>): string {
  return formatShellCopy(template, {
    promptNoun: GAME_DEFINITION.terminology.promptNoun,
    ...tokens,
  });
}

export function renderRoomFeedItem(item: RoomFeedItem, playerAccentColors: Map<string, string>, profanityFilterEnabled: boolean): ReactNode {
  const feedCopy = GAME_WEB_CONFIG.ui.copy.feed;

  if (item.type === 'roundHeader') {
    return (
      <div key={item.id} className="chat-msg msg-roundHeader">
        <div className="chat-msg-text">{formatFeedCopy(feedCopy.roundHeader, { roundNumber: item.roundNumber })}</div>
      </div>
    );
  }

  if (item.type === 'system') {
    const text = (() => {
      if (item.event.type === 'playerJoined') return formatFeedCopy(feedCopy.playerJoined, { nickname: item.event.nickname });
      if (item.event.type === 'drawerAssigned') return formatFeedCopy(feedCopy.drawerAssigned, { drawerNickname: item.event.drawerNickname });
      if (item.event.type === 'answerRevealed') return formatFeedCopy(feedCopy.answerRevealed, { answer: item.event.answer });
      if (item.event.type === 'allGuessersCorrect') return formatFeedCopy(feedCopy.allGuessersCorrect, {});
      if (item.event.type === 'gamePaused') return formatFeedCopy(feedCopy.gamePaused, {});
      return formatFeedCopy(feedCopy.gameResumed, {});
    })();

    return (
      <div key={item.id} className="chat-msg msg-system">
        <div className="chat-msg-text">{text}</div>
      </div>
    );
  }

  if (item.type === 'correctGuess') {
    const hasPosition = item.visibility === 'self' && item.totalGuessers !== undefined && item.totalGuessers > 1 && item.guessPosition !== undefined;
    const text = item.visibility === 'self'
      ? formatFeedCopy(hasPosition ? feedCopy.correctGuessSelfWithPosition : feedCopy.correctGuessSelf, {
        answer: item.answer,
        guessPosition: item.guessPosition,
        totalGuessers: item.totalGuessers,
      })
      : formatFeedCopy(feedCopy.correctGuessOther, { nickname: item.guesserNickname ?? 'A player' });

    return (
      <div key={item.id} className={`chat-msg ${item.visibility === 'self' ? 'msg-correctGuess' : 'msg-otherCorrectGuess'}`}>
        <div className="chat-msg-text">{text}</div>
      </div>
    );
  }

  const text = profanityFilterEnabled ? censorProfanity(item.text) : item.text;

  return (
    <div key={item.id} className="chat-msg msg-message">
      <div className="chat-msg-author" style={getPlayerAccentStyle(item.senderPlayerId, playerAccentColors)}>
        {item.senderNickname}
      </div>
      <div className="chat-msg-text">{text}</div>
    </div>
  );
}

export function renderStructuredRoomFeed(items: RoomFeedItem[], playerAccentColors: Map<string, string>, profanityFilterEnabled: boolean): ReactNode[] {
  const elements: ReactNode[] = [];
  let lastTurnNumber: number | null | undefined = undefined;

  for (const item of items) {
    const turnNumber = item.turnNumber ?? null;
    if (lastTurnNumber !== undefined && turnNumber !== lastTurnNumber) {
      elements.push(<hr key={`sep-${item.id}`} className="chat-turn-separator" />);
    }
    lastTurnNumber = turnNumber;
    elements.push(renderRoomFeedItem(item, playerAccentColors, profanityFilterEnabled));
  }

  return elements;
}

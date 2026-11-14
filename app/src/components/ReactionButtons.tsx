import React, { useState } from 'react';
import type { Locale } from '../config/appConfig';
import { getMessages } from '../lib/i18n';
import { reactionService } from '../services/reactionService';
import type { ReactionTargetType, ReactionType } from '../types/schema';

interface ReactionButtonsProps {
  targetType: ReactionTargetType;
  targetId: string;
  locale: Locale;
  compact?: boolean;
}

/**
 * リアクションボタン「行きたい」「行ったよ」（ブリーフ5）
 * - 魚詳細とエリアカードに設置。
 * - 段階0ではローカル表示のみ（自端末で押した状態を保持）。
 * - 表示カウントは 0 起点のモックではなく「（集計は公開後に開始）」と正直に表示する。
 */
export const ReactionButtons: React.FC<ReactionButtonsProps> = ({
  targetType,
  targetId,
  locale,
  compact = false,
}) => {
  const t = getMessages(locale);
  const [summary, setSummary] = useState(() =>
    reactionService.getReactionSummary(targetType, targetId)
  );

  // targetId が変わった時に最新状態を同期
  React.useEffect(() => {
    setSummary(reactionService.getReactionSummary(targetType, targetId));
  }, [targetType, targetId]);

  const handleToggle = (reaction: ReactionType) => {
    const updated = reactionService.toggleReaction(targetType, targetId, reaction);
    setSummary(updated);
  };

  const renderCountLabel = (reaction: ReactionType) => {
    if (summary.countAvailable && summary.counts) {
      return `${summary.counts[reaction]}`;
    }
    return t.reactions.countPlaceholder;
  };

  return (
    <div className={`reaction-box ${compact ? 'reaction-box-compact' : ''}`}>
      <div className="reaction-buttons-row">
        <button
          type="button"
          className={`reaction-btn ${summary.userState.want_to_go ? 'is-active' : ''}`}
          aria-pressed={summary.userState.want_to_go}
          onClick={() => handleToggle('want_to_go')}
        >
          <svg
            className="reaction-svg-icon"
            width="12"
            height="12"
            viewBox="0 0 12 12"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="10"
              height="10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            />
            {summary.userState.want_to_go && (
              <path
                d="M3 6.2L5.1 8.3L9.2 3.8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.3"
              />
            )}
          </svg>
          <span className="reaction-label">{t.reactions.wantToGo}</span>
          {summary.userState.want_to_go && (
            <span className="reaction-selected-pill">{t.reactions.activeState}</span>
          )}
          <span className="reaction-count-note">{renderCountLabel('want_to_go')}</span>
        </button>


      </div>
      
    </div>
  );
};

import React from 'react';
import type { Locale } from '../config/appConfig';
import { getMessages } from '../lib/i18n';

interface AboutPageProps {
  locale: Locale;
  onBackToToday: () => void;
}

/**
 * About画面（ブリーフ8・設計書 252, 262〜265行目）
 * - うみまちラボ沼津の紹介枠
 * - 免責（魚の提供・展示は各施設の当日の状況による／「行ったよ」は自己申告カウント）
 */
export const AboutPage: React.FC<AboutPageProps> = ({ locale, onBackToToday }) => {
  const t = getMessages(locale);

  return (
    <div className="page-container about-page">
      <section className="about-card">
        <h2 className="page-title">{t.about.title}</h2>

        <div className="about-block">
          <h3 className="about-heading">{t.about.conceptTitle}</h3>
          <p className="about-text">{t.about.conceptBody}</p>
        </div>

        <div className="about-block operator-highlight-box">
          <h3 className="about-heading">{t.about.operatorTitle}</h3>
          <p className="operator-name">{t.about.operatorName}</p>
          <p className="about-text">{t.about.operatorBody}</p>
        </div>

        <div className="about-block disclaimer-highlight-box">
          <h3 className="about-heading">{t.about.disclaimerTitle}</h3>
          <ul className="disclaimer-list">
            <li>{t.about.disclaimerItem1}</li>
            <li>{t.about.disclaimerItem2}</li>
            <li>{t.about.disclaimerItem3}</li>
          </ul>
        </div>

        <div className="about-block">
          <h3 className="about-heading">{t.about.dataPolicyTitle}</h3>
          <p className="about-text">{t.about.dataPolicyBody}</p>
        </div>

        <div className="about-actions">
          <button type="button" className="primary-action-btn" onClick={onBackToToday}>
            {t.common.backToToday}
          </button>
        </div>
      </section>
    </div>
  );
};

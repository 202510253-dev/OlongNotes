
/**
 * This file import SVG files and exports them as a bundled object
 * for use in injectable components where chrome.runtime.getURL() paths
 * mey not work due to "use_dynamic_url": "true' in manifest.json
 *   make sure you follow the theming convention for icons (light-mode, dark-mode, neutral) and only include icons that are used in injectable components to keep the bundle size small.
 */

export interface IconBundle {
  [iconName: string]: {
    'light-mode': string;
    'dark-mode': string;
    'neutral'?: string;
  };
}

// Manually import only the icons used in injectable components
// Light mode icons
import infoLight from './light-mode/info.svg';
import notFoundLight from './light-mode/not-found.svg';
import browserguardLogoShortLight from './light-mode/browserguard-logo-short.svg';
import closeLight from './light-mode/close.svg';
import doubleChevronRightLight from './light-mode/double-chevron-right.svg';
import downloadCircleLight from './light-mode/download-circle.svg';
import loadingDotsCircleLight from './light-mode/loading-dots-circle.svg';
import oapScanErrorLight from './light-mode/oap-scan-error.svg';
import oapCriticalLight from './light-mode/oap-critical.svg';
import oapMediumLight from './light-mode/oap-medium.svg';
import browserGuardLongLogoLight from './light-mode/browser-guard-long-logo.svg';
import oapActionNoticeLight from './light-mode/oap-action-notice.svg';
import arrowRightLight from './light-mode/arrow-right.svg';
import arrowLeftLight from './light-mode/arrow-left.svg';
import mbLogoBlueLight from './light-mode/mb-logo-blue.svg';
import oapResultsCloseLight from './light-mode/oap-results-close.svg';
import expandRightLight from './light-mode/expand-right.svg';
import oapTodoIndicatorLight from './light-mode/oap-todo-indicator.svg';
import checkLight from './light-mode/check.svg';
import chevronUpLight from './light-mode/chevron-up.svg';
import oapCheckDoneLight from './light-mode/oap-check-done.svg';
import oapCheckHollowLight from './light-mode/oap-check-hollow.svg';
import oapCheckSkippedLight from './light-mode/oap-check-skipped.svg';
import oapErrorItemLight from './light-mode/oap-error-item.svg';
import oapErrorItemRefreshLight from './light-mode/oap-error-item-refresh.svg';
import oapRescanLight from './light-mode/oap-rescan.svg';
import oapPlatformWindowsLight from './light-mode/oap-platform-windows.svg';
import oapPlatformAndroidLight from './light-mode/oap-platform-android.svg';
import oapPlatformIosLight from './light-mode/oap-platform-ios.svg';
import oapPlatformMacLight from './light-mode/oap-platform-mac.svg';
import warningOctaLight from './light-mode/warning-octa.svg';
import onlineSaftyLight from './light-mode/online-safety.svg';
import mbSolidLogoLight from './light-mode/mb-solid-logo.svg';
import warningRedCircleLight from './light-mode/warning-red-circle.svg';
import youtubeNotificationLight from './light-mode/youtube-notification.svg';

// Dark mode icons
import infoDark from './dark-mode/info.svg';
import notFoundDark from './dark-mode/not-found.svg';
import browserguardLogoShortDark from './dark-mode/browserguard-logo-short.svg';
import closeDark from './dark-mode/close.svg';
import doubleChevronRightDark from './dark-mode/double-chevron-right.svg';
import downloadCircleDark from './dark-mode/download-circle.svg';
import loadingDotsCircleDark from './dark-mode/loading-dots-circle.svg';
import oapScanErrorDark from './dark-mode/oap-scan-error.svg';
import oapCriticalDark from './dark-mode/oap-critical.svg';
import oapMediumDark from './dark-mode/oap-medium.svg';
import browserGuardLongLogoDark from './dark-mode/browser-guard-long-logo.svg';
import oapActionNoticeDark from './dark-mode/oap-action-notice.svg';
import arrowRightDark from './dark-mode/arrow-right.svg';
import arrowLeftDark from './dark-mode/arrow-left.svg';
import mbLogoBlueDark from './dark-mode/mb-logo-blue.svg';
import oapResultsCloseDark from './dark-mode/oap-results-close.svg';
import expandRightDark from './dark-mode/expand-right.svg';
import oapTodoIndicatorDark from './dark-mode/oap-todo-indicator.svg';
import checkDark from './dark-mode/check.svg';
import chevronUpDark from './dark-mode/chevron-up.svg';
import oapCheckDoneDark from './dark-mode/oap-check-done.svg';
import oapCheckHollowDark from './dark-mode/oap-check-hollow.svg';
import oapCheckSkippedDark from './dark-mode/oap-check-skipped.svg';
import oapErrorItemDark from './dark-mode/oap-error-item.svg';
import oapErrorItemRefreshDark from './dark-mode/oap-error-item-refresh.svg';
import oapRescanDark from './dark-mode/oap-rescan.svg';
import oapPlatformWindowsDark from './dark-mode/oap-platform-windows.svg';
import oapPlatformAndroidDark from './dark-mode/oap-platform-android.svg';
import oapPlatformIosDark from './dark-mode/oap-platform-ios.svg';
import oapPlatformMacDark from './dark-mode/oap-platform-mac.svg';
import warningOctaDark from './dark-mode/warning-octa.svg';
import onlineSaftyDark from './dark-mode/online-safety.svg';
import mbSolidLogoDark from './dark-mode/mb-solid-logo.svg';
import warningRedCircleDark from './dark-mode/warning-red-circle.svg';
import youtubeNotificationDark from './dark-mode/youtube-notification.svg';

// Neutral icons (only a few exist in neutral)
import aiScannerShieldNeutral from './neutral/ai-scanner-shield.svg';
import oapNotificationIconNeutral from './neutral/oap-notification-icon.svg';
import oapWaitingForAuthNeutral from './neutral/oap-waiting-for-auth.svg';
import shieldBadNeutral from './neutral/shield-bad.svg';
import shieldFairNeutral from './neutral/shield-fair.svg';
import shieldGoodNeutral from './neutral/shield-good.svg';

const bundledIcons: IconBundle = {
  'ai-scanner-shield': {
    'light-mode': '',  // Doesn't exist
    'dark-mode': '',  // Doesn't exist
    'neutral': aiScannerShieldNeutral,
  },
  'info': {
    'light-mode': infoLight,
    'dark-mode': infoDark,
  },
  'not-found': {
    'light-mode': notFoundLight,
    'dark-mode': notFoundDark,
  },
  'browserguard-logo-short': {
    'light-mode': browserguardLogoShortLight,
    'dark-mode': browserguardLogoShortDark,
  },
  'close': {
    'light-mode': closeLight,
    'dark-mode': closeDark,
  },
  'double-chevron-right': {
    'light-mode': doubleChevronRightLight,
    'dark-mode': doubleChevronRightDark,
  },
  'download-circle': {
    'light-mode': downloadCircleLight,
    'dark-mode': downloadCircleDark,
  },
  'loading-dots-circle': {
    'light-mode': loadingDotsCircleLight,
    'dark-mode': loadingDotsCircleDark,
  },
  'oap-scan-error': {
    'light-mode': oapScanErrorLight,
    'dark-mode': oapScanErrorDark,
  },
  'oap-critical': {
    'light-mode': oapCriticalLight,
    'dark-mode': oapCriticalDark,
  },
  'oap-medium': {
    'light-mode': oapMediumLight,
    'dark-mode': oapMediumDark,
  },
  'browser-guard-long-logo': {
    'light-mode': browserGuardLongLogoLight,
    'dark-mode': browserGuardLongLogoDark,
  },
  'oap-notification-icon': {
    'light-mode': '',  // Doesn't exist
    'dark-mode': '',  // Doesn't exist
    'neutral': oapNotificationIconNeutral,
  },
  'oap-action-notice': {
    'light-mode': oapActionNoticeLight,
    'dark-mode': oapActionNoticeDark,
  },
  'arrow-right': {
    'light-mode': arrowRightLight,
    'dark-mode': arrowRightDark,
  },
  'arrow-left': {
    'light-mode': arrowLeftLight,
    'dark-mode': arrowLeftDark,
  },
  'oap-waiting-for-auth': {
    'light-mode': '',  // Doesn't exist
    'dark-mode': '',  // Doesn't exist
    'neutral': oapWaitingForAuthNeutral,
  },
  'mb-logo-blue': {
    'light-mode': mbLogoBlueLight,
    'dark-mode': mbLogoBlueDark,
  },
  'oap-results-close': {
    'light-mode': oapResultsCloseLight,
    'dark-mode': oapResultsCloseDark,
  },
  'expand-right': {
    'light-mode': expandRightLight,
    'dark-mode': expandRightDark,
  },
  'oap-todo-indicator': {
    'light-mode': oapTodoIndicatorLight,
    'dark-mode': oapTodoIndicatorDark,
  },
  'check': {
    'light-mode': checkLight,
    'dark-mode': checkDark,
  },
  'chevron-up': {
    'light-mode': chevronUpLight,
    'dark-mode': chevronUpDark,
  },
  'oap-check-done': {
    'light-mode': oapCheckDoneLight,
    'dark-mode': oapCheckDoneDark,
  },
  'oap-check-hollow': {
    'light-mode': oapCheckHollowLight,
    'dark-mode': oapCheckHollowDark,
  },
  'oap-check-skipped': {
    'light-mode': oapCheckSkippedLight,
    'dark-mode': oapCheckSkippedDark,
  },
  'oap-error-item': {
    'light-mode': oapErrorItemLight,
    'dark-mode': oapErrorItemDark,
  },
  'oap-error-item-refresh': {
    'light-mode': oapErrorItemRefreshLight,
    'dark-mode': oapErrorItemRefreshDark,
  },
  'oap-rescan': {
    'light-mode': oapRescanLight,
    'dark-mode': oapRescanDark,
  },
  'shield-bad': {
    'light-mode': '',
    'dark-mode': '',
    'neutral': shieldBadNeutral,
  },
  'shield-fair': {
    'light-mode': '',
    'dark-mode': '',
    'neutral': shieldFairNeutral,
  },
  'shield-good': {
    'light-mode': '',
    'dark-mode': '',
    'neutral': shieldGoodNeutral,
  },
  'oap-platform-windows': {
    'light-mode': oapPlatformWindowsLight,
    'dark-mode': oapPlatformWindowsDark,
  },
  'oap-platform-android': {
    'light-mode': oapPlatformAndroidLight,
    'dark-mode': oapPlatformAndroidDark,
  },
  'oap-platform-ios': {
    'light-mode': oapPlatformIosLight,
    'dark-mode': oapPlatformIosDark,
  },
  'oap-platform-mac': {
    'light-mode': oapPlatformMacLight,
    'dark-mode': oapPlatformMacDark,
  },
  'warning-octa': {
    'light-mode': warningOctaLight,
    'dark-mode': warningOctaDark,
  },
  'online-safety': {
    'light-mode': onlineSaftyLight,
    'dark-mode': onlineSaftyDark,
  },
  'mb-solid-logo': {
    'light-mode': mbSolidLogoLight,
    'dark-mode': mbSolidLogoDark,
  },
  'warning-red-circle': {
    'light-mode': warningRedCircleLight,
    'dark-mode': warningRedCircleDark,
  },
  'youtube-notification': {
    'light-mode': youtubeNotificationLight,
    'dark-mode': youtubeNotificationDark,
  },
};

export default bundledIcons;

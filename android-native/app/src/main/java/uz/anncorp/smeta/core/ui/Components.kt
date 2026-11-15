package uz.anncorp.smeta.core.ui

import androidx.annotation.StringRes
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.AuthError

@Composable
fun QurLogo(size: Dp, modifier: Modifier = Modifier) {
    Image(
        painter = painterResource(R.drawable.ic_qur_logo),
        contentDescription = null,
        modifier = modifier.size(size),
        colorFilter = ColorFilter.tint(MaterialTheme.colorScheme.onBackground),
    )
}

/** Centered "coming soon" body used by screens that arrive in P1/P2. */
@Composable
fun SoonPlaceholder(modifier: Modifier = Modifier) {
    Column(modifier.padding(32.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        QurLogo(56.dp)
        Spacer(Modifier.height(20.dp))
        Text(stringResource(R.string.soon_title), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.onBackground)
        Spacer(Modifier.height(8.dp))
        Text(
            stringResource(R.string.soon_body), style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center,
        )
    }
}

@StringRes
fun AuthError.messageRes(): Int = when (this) {
    AuthError.BAD_CREDENTIALS -> R.string.err_bad_credentials
    AuthError.NETWORK -> R.string.err_network
    AuthError.RATE_LIMITED -> R.string.err_rate_limited
    AuthError.DISABLED -> R.string.err_disabled
    AuthError.UPDATE_REQUIRED -> R.string.err_update_required
    AuthError.DEVICE_LIMIT -> R.string.err_device_limit
    AuthError.GOOGLE_UNAVAILABLE -> R.string.err_google_unavailable
    AuthError.GOOGLE_CANCELLED -> R.string.err_google_cancelled
    AuthError.TELEGRAM_OFF -> R.string.err_telegram_off
    AuthError.TELEGRAM_EXPIRED -> R.string.err_telegram_expired
    AuthError.TELEGRAM_DENIED -> R.string.err_telegram_denied
    AuthError.SERVER -> R.string.err_server
    AuthError.EMAIL_BAD -> R.string.err_email_bad
    AuthError.EMAIL_OFF -> R.string.err_email_off
    AuthError.ACCOUNT_EXISTS -> R.string.err_account_exists
    AuthError.CODE_WRONG -> R.string.err_code_wrong
    AuthError.WEAK_PASSWORD -> R.string.err_weak_password
    AuthError.INVITE_OFF -> R.string.err_invite_off
    AuthError.INVITE_BAD -> R.string.err_invite_bad
    AuthError.INVITE_ACCOUNT_EXISTS -> R.string.err_invite_account_exists
}

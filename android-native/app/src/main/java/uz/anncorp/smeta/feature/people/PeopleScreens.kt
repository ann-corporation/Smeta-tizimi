package uz.anncorp.smeta.feature.people

import androidx.annotation.StringRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Person
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.anncorp.smeta.R
import uz.anncorp.smeta.core.data.CompanyInvite
import uz.anncorp.smeta.core.data.Features
import uz.anncorp.smeta.core.data.INVITE_ROLES
import uz.anncorp.smeta.core.data.LookupKind
import uz.anncorp.smeta.core.data.PeopleError
import uz.anncorp.smeta.core.data.PersonProfile
import uz.anncorp.smeta.core.data.PhoneSearch
import uz.anncorp.smeta.core.data.UsernameIssue
import uz.anncorp.smeta.core.ui.CenterMessage
import uz.anncorp.smeta.core.ui.WorkCard
import uz.anncorp.smeta.core.ui.WorkTopBar
import uz.anncorp.smeta.core.ui.formatStamp

@StringRes
fun PeopleError.res(): Int = when (this) {
    PeopleError.NETWORK -> R.string.err_network
    PeopleError.SERVER, PeopleError.UNAUTHORIZED -> R.string.err_server
    PeopleError.NOT_DEPLOYED -> R.string.pe_err_soon
    PeopleError.LIMIT -> R.string.pe_err_limit
    PeopleError.TAKEN -> R.string.pe_err_taken
    PeopleError.FORMAT -> R.string.pe_issue_format
    PeopleError.BAD_VALUE -> R.string.pe_err_value
    PeopleError.NOT_FOUND -> R.string.pe_err_notfound
    PeopleError.ALREADY_MEMBER -> R.string.pe_err_member
    PeopleError.NO_RIGHT -> R.string.pe_err_right
    PeopleError.BAD_ROLE -> R.string.pe_err_role
    PeopleError.INVITE_GONE, PeopleError.INVITE_INVALID -> R.string.pe_err_invite_gone
    PeopleError.INVITE_EXPIRED -> R.string.pe_err_invite_expired
}

@StringRes
fun UsernameIssue.res(): Int = when (this) {
    UsernameIssue.TOO_SHORT -> R.string.pe_issue_short
    UsernameIssue.TOO_LONG -> R.string.pe_issue_long
    UsernameIssue.FORMAT -> R.string.pe_issue_format
    UsernameIssue.START -> R.string.pe_issue_start
    UsernameIssue.UNDERSCORE -> R.string.pe_issue_underscore
    UsernameIssue.RESERVED -> R.string.pe_issue_reserved
}

@StringRes
private fun roleRes(code: String): Int? = when (code) {
    "rahbar" -> R.string.pe_role_rahbar
    "bugalter" -> R.string.pe_role_bugalter
    "pto" -> R.string.pe_role_pto
    "prorab" -> R.string.pe_role_prorab
    "buyurtmachi" -> R.string.pe_role_buyurtmachi
    "pudratchi" -> R.string.pe_role_pudratchi
    "kuzatuvchi" -> R.string.pe_role_kuzatuvchi
    else -> null
}

@Composable
private fun roleLabel(code: String): String = roleRes(code)?.let { stringResource(it) } ?: code

/** A person line used by every member / invite list: the name and, when the account has one, `@username` (else nothing is invented). */
@Composable
fun MemberRow(p: PersonProfile, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = MaterialTheme.shapes.extraLarge, modifier = Modifier.size(40.dp)) {
            Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                val initial = p.name.trim().firstOrNull()?.uppercaseChar()?.toString()
                if (initial != null) Text(initial, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
                else androidx.compose.material3.Icon(Icons.Filled.Person, null, tint = MaterialTheme.colorScheme.onPrimaryContainer)
            }
        }
        Column(Modifier.weight(1f)) {
            Text(p.name.ifBlank { p.username?.let { "@$it" } ?: "-" }, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurface, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            if (p.username != null && p.name.isNotBlank()) Text("@${p.username}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.primary)
        }
    }
}

@Composable
private fun PCard(content: @Composable () -> Unit) = WorkCard { androidx.compose.foundation.layout.Box(Modifier.padding(14.dp)) { content() } }

@Composable
private fun ErrorLine(@StringRes res: Int) =
    Text(stringResource(res), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 6.dp))

/** Profile section: my @username (live availability, suggestions), who can find me by phone/e-mail, and the entry points to invites. */
@Composable
fun UsernameSection(onInvite: () -> Unit, onInvites: () -> Unit, vm: UsernameViewModel = hiltViewModel()) {
    if (!Features.USERNAME) return
    val ui by vm.ui.collectAsStateWithLifecycle()
    Surface(color = MaterialTheme.colorScheme.surfaceContainerLow, shape = MaterialTheme.shapes.large, modifier = Modifier.fillMaxWidth()) {
        Column(Modifier.padding(16.dp)) {
            Text(stringResource(R.string.pe_username_title), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(Modifier.height(10.dp))
            when {
                ui.loading -> CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.dp)
                ui.unavailable != null -> Text(stringResource(ui.unavailable!!.res()), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                ui.editing -> UsernameEditor(ui, vm)
                else -> {
                    if (ui.current != null) {
                        Text("@${ui.current}", style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            TextButton(onClick = vm::edit) { Text(stringResource(R.string.pe_change)) }
                            TextButton(onClick = vm::remove, enabled = !ui.busy) { Text(stringResource(R.string.pe_remove), color = MaterialTheme.colorScheme.error) }
                        }
                    } else {
                        Text(stringResource(R.string.pe_none), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.height(8.dp))
                        Button(onClick = vm::edit, shape = MaterialTheme.shapes.medium) { Text(stringResource(R.string.pe_set)) }
                    }
                    ui.error?.let { ErrorLine(it.res()) }
                    Spacer(Modifier.height(12.dp))
                    HorizontalDivider()
                    Spacer(Modifier.height(12.dp))
                    Text(stringResource(R.string.pe_find_title), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                    Text(stringResource(R.string.pe_find_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Spacer(Modifier.height(8.dp))
                    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(PhoneSearch.ALL to R.string.pe_find_all, PhoneSearch.COWORKERS to R.string.pe_find_coworkers, PhoneSearch.NONE to R.string.pe_find_none).forEach { (v, label) ->
                            FilterChip(selected = ui.phoneSearch == v, onClick = { vm.setPhoneSearch(v) }, label = { Text(stringResource(label)) })
                        }
                    }
                }
            }
            if (ui.unavailable == null && !ui.loading) {
                Spacer(Modifier.height(12.dp))
                HorizontalDivider()
                Spacer(Modifier.height(4.dp))
                TextButton(onClick = onInvite) { Text(stringResource(R.string.pe_invite_title)) }
                TextButton(onClick = onInvites) { Text(if (ui.invites > 0) stringResource(R.string.pe_invites_count, ui.invites) else stringResource(R.string.pe_invites_title)) }
            }
        }
    }
}

@Composable
private fun UsernameEditor(ui: UsernameUi, vm: UsernameViewModel) {
    OutlinedTextField(
        value = ui.input, onValueChange = vm::type, singleLine = true, enabled = !ui.busy, prefix = { Text("@") },
        label = { Text(stringResource(R.string.pe_username_title)) }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium,
        isError = ui.availability is Availability.Invalid || ui.availability == Availability.Taken,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Ascii, imeAction = ImeAction.Done),
        supportingText = {
            val (text, bad) = when (val a = ui.availability) {
                Availability.None -> stringResource(R.string.pe_rules) to false
                Availability.Checking -> stringResource(R.string.pe_checking) to false
                Availability.Free -> stringResource(R.string.pe_free) to false
                Availability.Taken -> stringResource(R.string.pe_err_taken) to true
                Availability.Same -> stringResource(R.string.pe_same) to false
                is Availability.Invalid -> stringResource(a.issue.res()) to true
                is Availability.Failed -> stringResource(a.error.res()) to true
            }
            Text(text, color = if (bad) MaterialTheme.colorScheme.error else if (ui.availability == Availability.Free) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant)
        },
    )
    if (ui.suggestions.isNotEmpty()) {
        Spacer(Modifier.height(8.dp))
        Text(stringResource(R.string.pe_suggestions), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 4.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            ui.suggestions.forEach { s -> SuggestionChip(onClick = { vm.pick(s) }, label = { Text("@$s") }) }
        }
    }
    ui.error?.let { e -> if (ui.issue != null) ErrorLine(ui.issue.res()) else ErrorLine(e.res()) }
    ui.leftToday?.let { Text(stringResource(R.string.pe_left_today, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp)) }
    Spacer(Modifier.height(12.dp))
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = vm::save, enabled = ui.canSave, shape = MaterialTheme.shapes.medium) {
            if (ui.busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text(stringResource(R.string.pe_save))
        }
        OutlinedButton(onClick = vm::cancel, enabled = !ui.busy, shape = MaterialTheme.shapes.medium) { Text(stringResource(R.string.p1_cancel)) }
    }
}

/** One field (@username / phone / e-mail, kind auto-detected) with coworker autocomplete -> member_invite. */
@Composable
fun CompanyInviteScreen(onBack: () -> Unit, vm: CompanyInviteViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.pe_invite_title), onBack)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp)) {
            ui.companyName?.let { Text(it, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onBackground) }
            Text(stringResource(R.string.pe_invite_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp, bottom = 14.dp))
            OutlinedTextField(
                value = ui.input, onValueChange = vm::type, singleLine = true, enabled = !ui.busy,
                label = { Text(stringResource(R.string.pe_invite_field)) }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send),
                supportingText = {
                    val k = ui.kind
                    Text(when (k) {
                        LookupKind.USERNAME -> stringResource(R.string.pe_kind_username)
                        LookupKind.PHONE -> stringResource(R.string.pe_kind_phone)
                        LookupKind.EMAIL -> stringResource(R.string.pe_kind_email)
                        null -> stringResource(R.string.pe_kind_auto)
                    })
                },
            )
            if (ui.coworkers.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(stringResource(R.string.pe_coworkers), style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                PCard {
                    Column {
                        ui.coworkers.forEach { p -> MemberRow(p, Modifier.clickable { vm.pick(p) }) }
                    }
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(stringResource(R.string.pe_role), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                INVITE_ROLES.forEach { r -> FilterChip(selected = ui.role == r, onClick = { vm.role(r) }, label = { Text(roleLabel(r)) }) }
            }
            Spacer(Modifier.height(18.dp))
            Button(onClick = vm::send, enabled = ui.canSend, modifier = Modifier.fillMaxWidth().height(52.dp), shape = MaterialTheme.shapes.medium) {
                if (ui.busy) CircularProgressIndicator(Modifier.size(22.dp), strokeWidth = 2.5.dp, color = MaterialTheme.colorScheme.onPrimary) else Text(stringResource(R.string.pe_send), style = MaterialTheme.typography.titleMedium)
            }
            Spacer(Modifier.height(14.dp))
            InviteOutcomeView(ui, vm)
        }
    }
}

@Composable
private fun InviteOutcomeView(ui: InviteUi, vm: CompanyInviteViewModel) {
    when (val o = ui.outcome) {
        InviteOutcome.None -> Unit
        is InviteOutcome.Sent -> PCard {
            Column {
                Text(stringResource(R.string.pe_sent), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                o.profile?.let { MemberRow(it) }
                Text(stringResource(R.string.pe_sent_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                TextButton(onClick = vm::reset) { Text(stringResource(R.string.pe_another)) }
            }
        }
        is InviteOutcome.NotFound -> PCard {
            Column {
                Text(stringResource(R.string.pe_err_notfound), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.onSurface)
                if (o.phone != null) {
                    Text(stringResource(R.string.pe_phone_fallback, o.phone), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 6.dp))
                    OutlinedTextField(ui.phoneName, vm::phoneName, singleLine = true, enabled = !ui.busy, label = { Text(stringResource(R.string.pe_phone_name)) }, modifier = Modifier.fillMaxWidth(), shape = MaterialTheme.shapes.medium)
                    Spacer(Modifier.height(8.dp))
                    Button(onClick = vm::createCode, enabled = !ui.busy && ui.phoneName.trim().length >= 2, shape = MaterialTheme.shapes.medium) { Text(stringResource(R.string.pe_phone_make)) }
                }
            }
        }
        is InviteOutcome.Code -> {
            val clip = LocalClipboardManager.current
            PCard {
                Column {
                    Text(stringResource(R.string.pe_code_title), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
                    Text(o.code.code, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(vertical = 6.dp))
                    Text(o.code.link, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    Text(stringResource(R.string.pe_code_hint), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 6.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        TextButton(onClick = { clip.setText(AnnotatedString(o.code.code)) }) { Text(stringResource(R.string.pe_copy_code)) }
                        TextButton(onClick = { clip.setText(AnnotatedString(o.code.link)) }) { Text(stringResource(R.string.pe_copy_link)) }
                    }
                }
            }
        }
        is InviteOutcome.Failed -> ErrorLine(o.error.res())
    }
}

/** Incoming company invitations: accept / decline. Accepting makes the person a member, so the caller reloads the session. */
@Composable
fun InvitesScreen(onBack: () -> Unit, onAccepted: () -> Unit, vm: InvitesViewModel = hiltViewModel()) {
    val ui by vm.ui.collectAsStateWithLifecycle()
    Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
        WorkTopBar(stringResource(R.string.pe_invites_title), { if (ui.acceptedCompany) onAccepted() else onBack() })
        when {
            ui.loading -> Column(Modifier.fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { CircularProgressIndicator() }
            ui.items.isEmpty() && ui.error != null -> CenterMessage(null, stringResource(ui.error!!.res()), null, stringResource(R.string.retry)) { vm.load() }
            ui.items.isEmpty() -> CenterMessage(null, stringResource(R.string.pe_invites_empty), stringResource(R.string.pe_invites_empty_hint))
            else -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                ui.error?.let { ErrorLine(it.res()) }
                ui.items.forEach { inv -> InviteCard(inv, busy = ui.busyId == inv.id, enabled = ui.busyId == null, onAccept = { vm.answer(inv, true) }, onDecline = { vm.answer(inv, false) }) }
            }
        }
    }
    LaunchedEffect(ui.acceptedCompany, ui.items.isEmpty(), ui.loading) { if (ui.acceptedCompany && ui.items.isEmpty() && !ui.loading) onAccepted() }
}

@Composable
private fun InviteCard(inv: CompanyInvite, busy: Boolean, enabled: Boolean, onAccept: () -> Unit, onDecline: () -> Unit) {
    PCard {
        Column {
            Text(inv.companyName.ifBlank { "-" }, style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurface)
            Text(stringResource(R.string.pe_invite_as, roleLabel(inv.role)), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            inv.from?.let { Text(stringResource(R.string.pe_invited_by), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp)); MemberRow(it) }
            formatStamp(inv.expires)?.let { Text(stringResource(R.string.pe_expires, it), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            Spacer(Modifier.height(10.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(onClick = onAccept, enabled = enabled, shape = MaterialTheme.shapes.medium) {
                    if (busy) CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary) else Text(stringResource(R.string.pe_accept))
                }
                OutlinedButton(onClick = onDecline, enabled = enabled, shape = MaterialTheme.shapes.medium) { Text(stringResource(R.string.pe_decline)) }
            }
        }
    }
}

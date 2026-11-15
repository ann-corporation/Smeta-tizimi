package uz.anncorp.smeta.feature.people

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.anncorp.smeta.core.data.CompanyInvite
import uz.anncorp.smeta.core.data.Lookup
import uz.anncorp.smeta.core.data.LookupKind
import uz.anncorp.smeta.core.data.PeopleError
import uz.anncorp.smeta.core.data.PeopleRepository
import uz.anncorp.smeta.core.data.PeopleResult
import uz.anncorp.smeta.core.data.PersonProfile
import uz.anncorp.smeta.core.data.PhoneInviteCode
import uz.anncorp.smeta.core.data.PhoneSearch
import uz.anncorp.smeta.core.data.UsernameIssue
import uz.anncorp.smeta.core.data.UsernameRules
import uz.anncorp.smeta.core.data.UsernameVerdict
import uz.anncorp.smeta.core.data.WorkContext
import uz.anncorp.smeta.core.data.usernameVerdict
import javax.inject.Inject

/** State of the live availability check under the username field. */
sealed interface Availability {
    data object None : Availability
    data object Checking : Availability
    data class Invalid(val issue: UsernameIssue) : Availability
    data object Same : Availability
    data object Free : Availability
    data object Taken : Availability
    data class Failed(val error: PeopleError) : Availability
}

data class UsernameUi(
    val loading: Boolean = true,
    val unavailable: PeopleError? = null,
    val current: String? = null,
    val name: String? = null,
    val phoneSearch: PhoneSearch = PhoneSearch.ALL,
    val leftToday: Int? = null,
    val editing: Boolean = false,
    val input: String = "",
    val availability: Availability = Availability.None,
    val suggestions: List<String> = emptyList(),
    val busy: Boolean = false,
    val error: PeopleError? = null,
    val issue: UsernameIssue? = null,
    val invites: Int = 0,
) {
    val canSave get() = editing && !busy && availability == Availability.Free
}

@HiltViewModel
class UsernameViewModel @Inject constructor(private val repo: PeopleRepository) : ViewModel() {
    private val _ui = MutableStateFlow(UsernameUi())
    val ui: StateFlow<UsernameUi> = _ui.asStateFlow()
    private var checkJob: Job? = null

    init { refresh() }

    fun refresh() {
        viewModelScope.launch {
            when (val r = repo.mine()) {
                is PeopleResult.Ok -> _ui.update { it.copy(loading = false, unavailable = null, current = r.value.username, name = r.value.name, phoneSearch = r.value.phoneSearch, leftToday = r.value.leftToday) }
                is PeopleResult.Err -> _ui.update { it.copy(loading = false, unavailable = r.error) }
            }
            (repo.invites() as? PeopleResult.Ok)?.let { ok -> _ui.update { it.copy(invites = ok.value.size) } }
        }
    }

    fun edit() {
        val s = _ui.value
        _ui.update { it.copy(editing = true, input = s.current.orEmpty(), availability = Availability.None, error = null, issue = null) }
        val guesses = UsernameRules.suggestions(s.name.orEmpty())
        if (guesses.isNotEmpty()) viewModelScope.launch {
            // One call only to learn which of the name-based variants are free; the typed value is judged separately.
            (repo.check(guesses.first(), guesses) as? PeopleResult.Ok)?.let { ok ->
                _ui.update { u -> u.copy(suggestions = (ok.value.variants + listOfNotNull(guesses.first().takeIf { ok.value.free })).distinct().filter { it != u.current }.take(5)) }
            }
        }
    }

    fun cancel() { checkJob?.cancel(); _ui.update { it.copy(editing = false, input = "", availability = Availability.None, error = null, issue = null) } }

    /** Typing: instant local verdict, then a 400 ms debounced server check (only for a well-formed, changed name). */
    fun type(raw: String) {
        val shown = raw.take(40)
        checkJob?.cancel()
        _ui.update { it.copy(input = shown, error = null, issue = null) }
        when (val v = usernameVerdict(shown, _ui.value.current)) {
            UsernameVerdict.Empty -> _ui.update { it.copy(availability = Availability.None) }
            is UsernameVerdict.Invalid -> _ui.update { it.copy(availability = Availability.Invalid(v.issue)) }
            UsernameVerdict.Same -> _ui.update { it.copy(availability = Availability.Same) }
            UsernameVerdict.Ask -> {
                _ui.update { it.copy(availability = Availability.Checking) }
                val u = UsernameRules.norm(shown)!!
                checkJob = viewModelScope.launch {
                    delay(DEBOUNCE_MS)
                    val r = repo.check(u, _ui.value.suggestions)
                    if (UsernameRules.norm(_ui.value.input) != u) return@launch // the user kept typing
                    _ui.update { s ->
                        when (r) {
                            is PeopleResult.Ok -> s.copy(
                                availability = when { r.value.free -> Availability.Free; r.value.taken -> Availability.Taken; else -> Availability.Invalid(UsernameIssue.FORMAT) },
                                suggestions = if (r.value.variants.isNotEmpty()) r.value.variants.take(5) else s.suggestions,
                            )
                            is PeopleResult.Err -> s.copy(availability = r.issue?.let { Availability.Invalid(it) } ?: Availability.Failed(r.error))
                        }
                    }
                }
            }
        }
    }

    fun pick(suggestion: String) = type(suggestion)

    fun save() {
        val s = _ui.value
        val u = UsernameRules.norm(s.input) ?: return
        if (!s.canSave) return
        _ui.update { it.copy(busy = true, error = null, issue = null) }
        viewModelScope.launch {
            when (val r = repo.set(u)) {
                is PeopleResult.Ok -> _ui.update { it.copy(busy = false, editing = false, current = r.value ?: u, input = "", availability = Availability.None) }
                is PeopleResult.Err -> _ui.update { it.copy(busy = false, error = r.error, issue = r.issue, availability = if (r.error == PeopleError.TAKEN) Availability.Taken else it.availability) }
            }
        }
    }

    fun remove() {
        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.set(null)) {
                is PeopleResult.Ok -> _ui.update { it.copy(busy = false, editing = false, current = null) }
                is PeopleResult.Err -> _ui.update { it.copy(busy = false, error = r.error) }
            }
        }
    }

    fun setPhoneSearch(v: PhoneSearch) {
        val before = _ui.value.phoneSearch
        _ui.update { it.copy(phoneSearch = v, error = null) }
        viewModelScope.launch {
            if (repo.setPhoneSearch(v) is PeopleResult.Err) _ui.update { it.copy(phoneSearch = before, error = PeopleError.SERVER) }
        }
    }

    companion object { const val DEBOUNCE_MS = 400L }
}

sealed interface InviteOutcome {
    data object None : InviteOutcome
    data class Sent(val profile: PersonProfile?) : InviteOutcome
    /** The value matched no account. [phone] != null = a link + code invite can be created instead. */
    data class NotFound(val phone: String?) : InviteOutcome
    data class Code(val code: PhoneInviteCode) : InviteOutcome
    data class Failed(val error: PeopleError) : InviteOutcome
}

data class InviteUi(
    val companyName: String? = null,
    val input: String = "",
    val role: String = "pto",
    val phoneName: String = "",
    val coworkers: List<PersonProfile> = emptyList(),
    val busy: Boolean = false,
    val outcome: InviteOutcome = InviteOutcome.None,
) {
    val kind: LookupKind? get() = Lookup.kind(input)
    val canSend get() = !busy && kind != null && Lookup.value(input) != null
}

@HiltViewModel
class CompanyInviteViewModel @Inject constructor(private val repo: PeopleRepository, private val ctx: WorkContext) : ViewModel() {
    private val _ui = MutableStateFlow(InviteUi(companyName = ctx.current.value?.nom))
    val ui: StateFlow<InviteUi> = _ui.asStateFlow()
    private var searchJob: Job? = null

    fun type(raw: String) {
        val v = raw.take(80)
        _ui.update { it.copy(input = v, outcome = InviteOutcome.None) }
        searchJob?.cancel()
        // Autocomplete among coworkers by name / @username prefix; a phone or e-mail is never searched as a prefix.
        val prefix = v.trim().removePrefix("@")
        if (prefix.length < 2 || Lookup.kind(v) == LookupKind.PHONE || Lookup.kind(v) == LookupKind.EMAIL) { _ui.update { it.copy(coworkers = emptyList()) }; return }
        searchJob = viewModelScope.launch {
            delay(300)
            val r = repo.coworkers(prefix, ctx.current.value?.companyId)
            if (_ui.value.input.trim().removePrefix("@") == prefix) _ui.update { it.copy(coworkers = (r as? PeopleResult.Ok)?.value.orEmpty()) }
        }
    }

    fun pick(p: PersonProfile) { searchJob?.cancel(); _ui.update { it.copy(input = p.username?.let { u -> "@$u" } ?: it.input, coworkers = emptyList(), outcome = InviteOutcome.None) } }
    fun role(r: String) = _ui.update { it.copy(role = r) }
    fun phoneName(n: String) = _ui.update { it.copy(phoneName = n.take(80)) }

    fun send() {
        val s = _ui.value
        val company = ctx.current.value?.companyId ?: return
        if (!s.canSend) return
        _ui.update { it.copy(busy = true, outcome = InviteOutcome.None, coworkers = emptyList()) }
        viewModelScope.launch {
            val r = repo.invite(company, s.input, s.role)
            _ui.update {
                it.copy(busy = false, outcome = when (r) {
                    is PeopleResult.Ok -> InviteOutcome.Sent(r.value.profile)
                    is PeopleResult.Err -> when {
                        r.error == PeopleError.NOT_FOUND -> InviteOutcome.NotFound(if (r.phoneInvite) (r.phone ?: Lookup.phone(s.input)) else null)
                        else -> InviteOutcome.Failed(r.error)
                    }
                })
            }
        }
    }

    /** Fallback for a phone with no account: one-time link + 8-digit code (shown once; the director sends it himself, no SMS). */
    fun createCode() {
        val s = _ui.value
        val company = ctx.current.value?.companyId ?: return
        val phone = (s.outcome as? InviteOutcome.NotFound)?.phone ?: return
        if (s.busy || s.phoneName.trim().length < 2) return
        _ui.update { it.copy(busy = true) }
        viewModelScope.launch {
            val r = repo.phoneInvite(company, s.phoneName, phone, s.role)
            _ui.update { it.copy(busy = false, outcome = when (r) { is PeopleResult.Ok -> InviteOutcome.Code(r.value); is PeopleResult.Err -> InviteOutcome.Failed(r.error) }) }
        }
    }

    fun reset() = _ui.update { InviteUi(companyName = it.companyName, role = it.role) }
}

data class InvitesUi(
    val loading: Boolean = true,
    val items: List<CompanyInvite> = emptyList(),
    val busyId: Long? = null,
    val error: PeopleError? = null,
    val acceptedCompany: Boolean = false,
)

@HiltViewModel
class InvitesViewModel @Inject constructor(private val repo: PeopleRepository) : ViewModel() {
    private val _ui = MutableStateFlow(InvitesUi())
    val ui: StateFlow<InvitesUi> = _ui.asStateFlow()

    init { load() }

    fun load() {
        _ui.update { it.copy(loading = true, error = null) }
        viewModelScope.launch {
            when (val r = repo.invites()) {
                is PeopleResult.Ok -> _ui.update { it.copy(loading = false, items = r.value) }
                is PeopleResult.Err -> _ui.update { it.copy(loading = false, error = r.error) }
            }
        }
    }

    fun answer(inv: CompanyInvite, accept: Boolean) {
        if (_ui.value.busyId != null) return
        _ui.update { it.copy(busyId = inv.id, error = null) }
        viewModelScope.launch {
            when (val r = repo.answer(inv.id, accept)) {
                is PeopleResult.Ok -> _ui.update { it.copy(busyId = null, items = it.items.filter { x -> x.id != inv.id }, acceptedCompany = it.acceptedCompany || r.value.accepted) }
                is PeopleResult.Err -> _ui.update {
                    // A stale / expired / withdrawn invite disappears from the list; other errors keep it for a retry.
                    val gone = r.error in setOf(PeopleError.INVITE_GONE, PeopleError.INVITE_EXPIRED, PeopleError.INVITE_INVALID)
                    it.copy(busyId = null, error = r.error, items = if (gone) it.items.filter { x -> x.id != inv.id } else it.items)
                }
            }
        }
    }
}

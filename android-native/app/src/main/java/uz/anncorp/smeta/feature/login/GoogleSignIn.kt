package uz.anncorp.smeta.feature.login

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import uz.anncorp.smeta.core.data.AuthError

sealed interface GoogleResult {
    data class Token(val idToken: String) : GoogleResult
    data class Failed(val error: AuthError) : GoogleResult
}

/** Credential Manager wrapper. [serverClientId] is the WEB client id returned by GET /api/kirish-google (the server's `aud`). */
object GoogleSignIn {
    suspend fun idToken(activityContext: Context, serverClientId: String): GoogleResult {
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val result = CredentialManager.create(activityContext).getCredential(activityContext, request)
            val cred = result.credential
            if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleResult.Token(GoogleIdTokenCredential.createFrom(cred.data).idToken)
            } else GoogleResult.Failed(AuthError.GOOGLE_UNAVAILABLE)
        } catch (e: GetCredentialCancellationException) {
            GoogleResult.Failed(AuthError.GOOGLE_CANCELLED)
        } catch (e: GetCredentialException) {
            GoogleResult.Failed(AuthError.GOOGLE_UNAVAILABLE)
        } catch (e: Exception) {
            GoogleResult.Failed(AuthError.GOOGLE_UNAVAILABLE)
        }
    }
}

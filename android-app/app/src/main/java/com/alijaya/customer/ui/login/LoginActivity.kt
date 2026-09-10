package com.alijaya.customer.ui.login

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.alijaya.customer.CustomerApplication
import com.alijaya.customer.data.api.ApiClient
import com.alijaya.customer.data.pref.SessionManager
import com.alijaya.customer.databinding.ActivityLoginBinding
import com.alijaya.customer.ui.main.MainActivity
import com.alijaya.customer.ui.server.ServerConfigActivity
import kotlinx.coroutines.launch

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.tvServerUrl.text = "Server: " + CustomerApplication.sessionManager.getServerBaseUrl()

        binding.btnServerSetting.setOnClickListener {
            startActivity(Intent(this, ServerConfigActivity::class.java))
        }

        binding.btnLogin.setOnClickListener {
            val loginId = binding.etLoginId.text.toString().trim()
            val password = binding.etPassword.text.toString().trim()

            if (loginId.isEmpty()) {
                Toast.makeText(this, "Username / No. WA / ID harus diisi", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (password.isEmpty()) {
                Toast.makeText(this, "Password / PIN harus diisi", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            doLogin(loginId, password)
        }
    }

    override fun onResume() {
        super.onResume()
        binding.tvServerUrl.text = "Server: " + CustomerApplication.sessionManager.getServerBaseUrl()
    }

    private fun doLogin(loginId: String, pass: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnLogin.isEnabled = false

        lifecycleScope.launch {
            try {
                val body = mapOf(
                    "loginId" to loginId,
                    "password" to pass
                )

                val res = ApiClient.getService().login(body)
                if (res.isSuccessful && res.body()?.success == true) {
                    val token = res.body()?.token ?: ""
                    val role = res.body()?.role ?: SessionManager.PORTAL_CUSTOMER
                    val cust = res.body()?.customer
                    val user = res.body()?.user

                    val session = CustomerApplication.sessionManager
                    session.saveAuthToken(token)
                    session.saveConfig(session.getServerBaseUrl(), role)

                    if (cust != null) {
                        session.saveCustomerInfo(cust.id, cust.name, cust.phone)
                    } else if (user != null) {
                        session.saveCustomerInfo(user.id, user.name, user.phone ?: "")
                    }

                    Toast.makeText(this@LoginActivity, "Login berhasil sebagai " + session.getPortalDisplayName() + "!", Toast.LENGTH_SHORT).show()
                    val intent = Intent(this@LoginActivity, MainActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    }
                    startActivity(intent)
                    finish()
                } else {
                    val err = res.body()?.message ?: "Login gagal. Username atau password salah."
                    Toast.makeText(this@LoginActivity, err, Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                val errMsg = e.message ?: "Koneksi ke server gagal"
                Toast.makeText(this@LoginActivity, "Gagal terhubung: " + errMsg, Toast.LENGTH_LONG).show()
            } finally {
                binding.progressBar.visibility = View.GONE
                binding.btnLogin.isEnabled = true
            }
        }
    }
}

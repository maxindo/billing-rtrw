package com.alijaya.customer.ui.server

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.webkit.CookieManager
import android.widget.ArrayAdapter
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.alijaya.customer.CustomerApplication
import com.alijaya.customer.data.pref.SessionManager
import com.alijaya.customer.databinding.ActivityServerConfigBinding
import com.alijaya.customer.ui.login.LoginActivity
import com.alijaya.customer.ui.main.MainActivity
import com.alijaya.customer.util.BluetoothPrinterHelper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class ServerConfigActivity : AppCompatActivity() {
    private lateinit var binding: ActivityServerConfigBinding
    private var pairedPrinters: List<BluetoothPrinterHelper.PairedPrinter> = emptyList()

    private val requestBtPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val isGranted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions[Manifest.permission.BLUETOOTH_CONNECT] == true
        } else {
            permissions[Manifest.permission.ACCESS_FINE_LOCATION] == true || permissions[Manifest.permission.BLUETOOTH] == true
        }

        if (isGranted) {
            loadBluetoothPrinters()
            Toast.makeText(this, "Izin Bluetooth berhasil diberikan", Toast.LENGTH_SHORT).show()
        } else {
            Toast.makeText(this, "Izin Bluetooth diperlukan untuk membaca daftar printer", Toast.LENGTH_LONG).show()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityServerConfigBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val session = CustomerApplication.sessionManager

        // Load existing values
        binding.etServerUrl.setText(session.getServerBaseUrl())

        when (session.getPortalType()) {
            SessionManager.PORTAL_AGENT -> binding.rbAgent.isChecked = true
            SessionManager.PORTAL_TECH -> binding.rbTech.isChecked = true
            SessionManager.PORTAL_ADMIN -> binding.rbAdmin.isChecked = true
            SessionManager.PORTAL_COLLECTOR -> binding.rbCollector.isChecked = true
            else -> binding.rbCustomer.isChecked = true
        }

        if (session.isPrinter80mm()) {
            binding.rb80mm.isChecked = true
        } else {
            binding.rb58mm.isChecked = true
        }

        checkAndRequestBtPermissions()
        updatePreviewUrl()

        // Radio button changes
        binding.rgPortalType.setOnCheckedChangeListener { _, _ ->
            updatePreviewUrl()
        }

        // Quick Preset Buttons
        binding.btnPresetAlijaya.setOnClickListener {
            binding.etServerUrl.setText("https://app.alijaya.com")
            updatePreviewUrl()
            testConnection()
        }

        binding.btnPresetLocal.setOnClickListener {
            binding.etServerUrl.setText("http://192.168.8.5:3001")
            updatePreviewUrl()
            testConnection()
        }

        // Test Connection Button
        binding.btnTestConnection.setOnClickListener {
            testConnection()
        }

        // Scan Bluetooth Printers
        binding.btnScanPrinters.setOnClickListener {
            checkAndRequestBtPermissions(force = true)
        }

        // Open Phone's Bluetooth Settings
        binding.btnOpenBtSettings.setOnClickListener {
            try {
                startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS))
            } catch (_: Exception) {
                Toast.makeText(this, "Buka menu Pengaturan Bluetooth di HP Anda", Toast.LENGTH_SHORT).show()
            }
        }

        // Test Print Struk
        binding.btnTestPrint.setOnClickListener {
            val selectedIdx = binding.spPrinters.selectedItemPosition
            if (selectedIdx >= 0 && selectedIdx < pairedPrinters.size) {
                val p = pairedPrinters[selectedIdx]
                val is80mm = binding.rb80mm.isChecked
                lifecycleScope.launch {
                    binding.btnTestPrint.isEnabled = false
                    binding.btnTestPrint.text = " Mencetak..."
                    val res = BluetoothPrinterHelper.printInvoiceReceipt(
                        deviceAddress = p.address,
                        is80mm = is80mm,
                        companyName = "ALIJAYA NETWORK",
                        companyAddress = "Jl. Raya Utama No. 123",
                        companyPhone = "08123456789",
                        invoiceNumber = "#TEST-001",
                        customerName = "Tes Cetak Struk",
                        packageName = "Paket Internet 20 Mbps",
                        period = "Agu 2026",
                        amountFormatted = "Rp 150.000",
                        collectorName = "Admin",
                        paymentDate = "24/08/2026 08:00"
                    )
                    binding.btnTestPrint.isEnabled = true
                    binding.btnTestPrint.text = " Tes Cetak Struk Contoh"

                    if (res.isSuccess) {
                        Toast.makeText(this@ServerConfigActivity, "Berhasil mencetak ke ${p.name}", Toast.LENGTH_SHORT).show()
                    } else {
                        Toast.makeText(this@ServerConfigActivity, "Gagal: ${res.exceptionOrNull()?.message}", Toast.LENGTH_LONG).show()
                    }
                }
            } else {
                Toast.makeText(this, "Silakan pilih printer Bluetooth yang terpasang", Toast.LENGTH_SHORT).show()
            }
        }

        // Save Button
        binding.btnSave.setOnClickListener {
            val url = binding.etServerUrl.text.toString().trim()
            if (url.isEmpty()) {
                Toast.makeText(this, "Alamat server tidak boleh kosong", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }

            val selectedPortal = when (binding.rgPortalType.checkedRadioButtonId) {
                binding.rbAgent.id -> SessionManager.PORTAL_AGENT
                binding.rbTech.id -> SessionManager.PORTAL_TECH
                binding.rbAdmin.id -> SessionManager.PORTAL_ADMIN
                binding.rbCollector.id -> SessionManager.PORTAL_COLLECTOR
                else -> SessionManager.PORTAL_CUSTOMER
            }

            // Save printer
            val selectedIdx = binding.spPrinters.selectedItemPosition
            if (selectedIdx >= 0 && selectedIdx < pairedPrinters.size) {
                val p = pairedPrinters[selectedIdx]
                session.setPrinter(p.address, p.name, binding.rb80mm.isChecked)
            }

            // Clear old session cookies when changing server or portal
            CookieManager.getInstance().removeAllCookies(null)
            CookieManager.getInstance().flush()

            session.saveConfig(url, selectedPortal)
            Toast.makeText(this, "Pengaturan berhasil disimpan!", Toast.LENGTH_SHORT).show()

            val targetClass = if (!session.isLoggedIn()) {
                LoginActivity::class.java
            } else {
                MainActivity::class.java
            }

            val intent = Intent(this, targetClass).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            }
            startActivity(intent)
            finish()
        }

        // Reset Button
        binding.btnReset.setOnClickListener {
            session.resetToDefault()
            binding.etServerUrl.setText(SessionManager.DEFAULT_SERVER_URL)
            binding.rbCustomer.isChecked = true
            updatePreviewUrl()
            Toast.makeText(this, "Server direset ke Default (Alijaya Customer)", Toast.LENGTH_SHORT).show()
        }
    }

    private fun checkAndRequestBtPermissions(force: Boolean = false) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val connectGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
            val scanGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) == PackageManager.PERMISSION_GRANTED
            if (!connectGranted || !scanGranted) {
                requestBtPermissionLauncher.launch(arrayOf(
                    Manifest.permission.BLUETOOTH_CONNECT,
                    Manifest.permission.BLUETOOTH_SCAN
                ))
                return
            }
        } else {
            val locGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
            if (!locGranted) {
                requestBtPermissionLauncher.launch(arrayOf(
                    Manifest.permission.ACCESS_FINE_LOCATION,
                    Manifest.permission.ACCESS_COARSE_LOCATION
                ))
                return
            }
        }

        loadBluetoothPrinters()
    }

    private fun loadBluetoothPrinters() {
        pairedPrinters = BluetoothPrinterHelper.getPairedPrinters()
        val session = CustomerApplication.sessionManager

        val items = if (pairedPrinters.isEmpty()) {
            listOf("Tidak ada printer Bluetooth terhubung (Tekan )")
        } else {
            pairedPrinters.map { "${it.name} (${it.address})" }
        }

        val adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, items)
        binding.spPrinters.adapter = adapter

        // Select previously saved printer
        val savedMac = session.getPrinterMac()
        if (savedMac.isNotEmpty()) {
            val idx = pairedPrinters.indexOfFirst { it.address.equals(savedMac, ignoreCase = true) }
            if (idx >= 0) binding.spPrinters.setSelection(idx)
        }
    }

    private fun getUnsafeOkHttpClient(): OkHttpClient {
        return try {
            val trustAllCerts = arrayOf<TrustManager>(object : X509TrustManager {
                override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
            })

            val sslContext = SSLContext.getInstance("SSL")
            sslContext.init(null, trustAllCerts, SecureRandom())

            OkHttpClient.Builder()
                .sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
                .hostnameVerifier { _, _ -> true }
                .connectTimeout(6, TimeUnit.SECONDS)
                .readTimeout(6, TimeUnit.SECONDS)
                .followRedirects(true)
                .build()
        } catch (_: Exception) {
            OkHttpClient.Builder()
                .connectTimeout(6, TimeUnit.SECONDS)
                .readTimeout(6, TimeUnit.SECONDS)
                .build()
        }
    }

    private fun testConnection() {
        val rawUrl = binding.etServerUrl.text.toString().trim()
        val base = if (rawUrl.isEmpty()) "https://app.alijaya.com" else rawUrl
        val cleanBase = if (base.startsWith("http://") || base.startsWith("https://")) base else "https://$base"
        val pingUrl = if (cleanBase.endsWith("/")) "${cleanBase}api/customer/ping" else "$cleanBase/api/customer/ping"

        binding.tvConnectionStatus.text = "Status:  Menghubungkan ke $cleanBase..."
        binding.tvConnectionStatus.setTextColor(Color.parseColor("#38BDF8"))

        lifecycleScope.launch {
            var detectedIsp = ""
            val isSuccess = withContext(Dispatchers.IO) {
                try {
                    val client = getUnsafeOkHttpClient()
                    val request = Request.Builder().url(pingUrl).build()
                    val response = client.newCall(request).execute()
                    if (response.isSuccessful) {
                        val str = response.body?.string()
                        if (!str.isNullOrBlank()) {
                            try {
                                val json = org.json.JSONObject(str)
                                detectedIsp = json.optString("companyHeader", json.optString("ispName", json.optString("appName", "")))
                                if (detectedIsp.isNotBlank()) {
                                    CustomerApplication.sessionManager.saveIspName(detectedIsp)
                                }
                            } catch (_: Exception) {}
                        }
                        true
                    } else {
                        val rootReq = Request.Builder().url(cleanBase).build()
                        val rootResp = client.newCall(rootReq).execute()
                        rootResp.isSuccessful || rootResp.code < 500
                    }
                } catch (_: Exception) {
                    try {
                        val client = getUnsafeOkHttpClient()
                        val rootReq = Request.Builder().url(cleanBase).build()
                        val rootResp = client.newCall(rootReq).execute()
                        rootResp.isSuccessful || rootResp.code < 500
                    } catch (_: Exception) {
                        false
                    }
                }
            }

            if (isSuccess) {
                val headerNote = if (detectedIsp.isNotEmpty()) " [$detectedIsp]" else ""
                binding.tvConnectionStatus.text = "Status:  ONLINE$headerNote"
                binding.tvConnectionStatus.setTextColor(Color.parseColor("#10B981"))
            } else {
                binding.tvConnectionStatus.text = "Status:  OFFLINE / Menunggu Jaringan (Cek URL/Koneksi)"
                binding.tvConnectionStatus.setTextColor(Color.parseColor("#EF4444"))
            }
        }
    }

    private fun updatePreviewUrl() {
        val rawUrl = binding.etServerUrl.text.toString().trim()
        val base = if (rawUrl.isEmpty()) "https://app.alijaya.com" else rawUrl

        val path = when (binding.rgPortalType.checkedRadioButtonId) {
            binding.rbAgent.id -> "/agent/login"
            binding.rbTech.id -> "/tech/login"
            binding.rbAdmin.id -> "/admin/login"
            binding.rbCollector.id -> "/collector/login"
            else -> "/customer/login"
        }

        binding.tvPreviewUrl.text = "Target: $base$path"
    }
}

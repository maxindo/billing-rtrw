package com.alijaya.customer.ui.invoices

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.ImageView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.alijaya.customer.CustomerApplication
import com.alijaya.customer.R
import com.alijaya.customer.databinding.ActivityPaymentBinding
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.text.NumberFormat
import java.util.Locale
import java.util.concurrent.TimeUnit
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

class PaymentActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPaymentBinding
    private var invoiceId: Int = 0
    private var totalAmountToPay: Double = 0.0
    private var currentQrBitmap: Bitmap? = null
    private var currentQrPayload: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPaymentBinding.inflate(layoutInflater)
        setContentView(binding.root)

        invoiceId = intent.getIntExtra("invoice_id", 0)

        binding.btnBack.setOnClickListener { finish() }

        setupActions()

        binding.pbQrisLoading.visibility = View.VISIBLE
        loadInvoiceAndQris()
    }

    private fun setupActions() {
        binding.btnCheckStatus.setOnClickListener {
            checkPaymentStatus()
        }

        binding.btnEnlargeQris.setOnClickListener {
            showFullScreenQrDialog()
        }

        binding.btnConfirmPayment.setOnClickListener {
            val phone = "6287820851413"
            val text = "Halo Admin, saya konfirmasi pembayaran tagihan #INV-$invoiceId sebesar Rp ${totalAmountToPay.toInt()} atas nama ${CustomerApplication.sessionManager.getCustomerName()}"
            val url = "https://wa.me/$phone?text=" + Uri.encode(text)
            try {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
            } catch (_: Exception) {
                Toast.makeText(this, "Membuka WhatsApp...", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun generateLocalQrBitmap(content: String) {
        lifecycleScope.launch(Dispatchers.Default) {
            try {
                val writer = QRCodeWriter()
                val bitMatrix = writer.encode(content, BarcodeFormat.QR_CODE, 600, 600)
                val width = bitMatrix.width
                val height = bitMatrix.height
                val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
                for (x in 0 until width) {
                    for (y in 0 until height) {
                        bmp.setPixel(x, y, if (bitMatrix.get(x, y)) Color.BLACK else Color.WHITE)
                    }
                }
                currentQrBitmap = bmp
                withContext(Dispatchers.Main) {
                    binding.ivQrisImage.setImageBitmap(bmp)
                    binding.pbQrisLoading.visibility = View.GONE
                }
            } catch (_: Exception) {}
        }
    }

    private fun showFullScreenQrDialog() {
        if (currentQrBitmap == null) return
        val iv = ImageView(this).apply {
            setImageBitmap(currentQrBitmap)
            scaleType = ImageView.ScaleType.FIT_CENTER
            setPadding(30, 30, 30, 30)
            setBackgroundColor(Color.WHITE)
        }
        AlertDialog.Builder(this)
            .setTitle(" Barcode QRIS Tagihan")
            .setView(iv)
            .setPositiveButton("Tutup", null)
            .show()
    }

    private fun getUnsafeOkHttpClient(): OkHttpClient {
        val builder = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)

        try {
            val trustAllCerts = arrayOf<TrustManager>(
                object : X509TrustManager {
                    override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
                    override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
                }
            )
            val sslContext = SSLContext.getInstance("SSL")
            sslContext.init(null, trustAllCerts, SecureRandom())
            builder.sslSocketFactory(sslContext.socketFactory, trustAllCerts[0] as X509TrustManager)
            builder.hostnameVerifier { _, _ -> true }
        } catch (_: Exception) {}

        return builder.build()
    }

    private fun loadInvoiceAndQris() {
        val base = CustomerApplication.sessionManager.getServerBaseUrl()
        val token = CustomerApplication.sessionManager.getAuthToken()

        val url = if (base.endsWith("/")) base + "api/customer/invoices/" + invoiceId else base + "/api/customer/invoices/" + invoiceId
        val qrisImgUrl = if (base.endsWith("/")) base + "api/customer/invoices/" + invoiceId + "/qris-image" else base + "/api/customer/invoices/" + invoiceId + "/qris-image"

        lifecycleScope.launch {
            // 1. Fetch JSON details
            val jsonStr = withContext(Dispatchers.IO) {
                try {
                    val client = getUnsafeOkHttpClient()
                    val req = Request.Builder()
                        .url(url)
                        .addHeader("Authorization", "Bearer " + (token ?: ""))
                        .build()
                    val resp = client.newCall(req).execute()
                    if (resp.isSuccessful) resp.body?.string() else null
                } catch (_: Exception) { null }
            }

            if (jsonStr != null) {
                try {
                    val data = JSONObject(jsonStr).optJSONObject("data")
                    if (data != null) {
                        val baseAmt = data.optDouble("baseAmount", 150000.0)
                        val uniqueCode = data.optInt("uniqueCode", 123)
                        val totalAmt = data.optDouble("totalAmount", baseAmt + uniqueCode)
                        totalAmountToPay = totalAmt

                        val payload = data.optString("qrisPayload", "")
                        if (payload.isNotEmpty()) {
                            currentQrPayload = payload
                            generateLocalQrBitmap(payload)
                        }

                        val fmt = NumberFormat.getCurrencyInstance(Locale("id", "ID"))

                        binding.tvInvoiceNo.text = data.optString("invoiceNo", "#INV-$invoiceId")
                        binding.tvPackageName.text = data.optString("packageName", "Paket Internet Home")
                        binding.tvPeriod.text = "Periode: Bulan " + data.optInt("periodMonth", 8) + "/" + data.optInt("periodYear", 2026)

                        binding.tvBaseAmount.text = fmt.format(baseAmt)
                        binding.tvUniqueCode.text = "+ " + fmt.format(uniqueCode)
                        binding.tvTotalAmount.text = fmt.format(totalAmt)
                        binding.tvQrisNotice.text = "Pastikan nominal yang Anda transfer / scan PERSIS SAMA hingga 3 digit terakhir (" + fmt.format(totalAmt) + ") agar otomatis terverifikasi LUNAS."

                        val status = data.optString("status", "unpaid")
                        if (status == "paid" || status == "lunas") {
                            binding.tvTotalAmount.setTextColor(ContextCompat.getColor(this@PaymentActivity, R.color.success))
                            binding.tvTotalAmount.text = fmt.format(totalAmt) + " (LUNAS)"
                            binding.btnCheckStatus.text = " Tagihan Ini Telah LUNAS"
                        }
                    }
                } catch (_: Exception) {}
            }

            // 2. Fetch QR Image Bitmap from server as double verification
            val bitmap = withContext(Dispatchers.IO) {
                try {
                    val client = getUnsafeOkHttpClient()
                    val req = Request.Builder().url(qrisImgUrl).build()
                    val resp = client.newCall(req).execute()
                    if (resp.isSuccessful) {
                        val bytes = resp.body?.bytes()
                        if (bytes != null) BitmapFactory.decodeByteArray(bytes, 0, bytes.size) else null
                    } else null
                } catch (_: Exception) { null }
            }

            if (bitmap != null) {
                currentQrBitmap = bitmap
                binding.ivQrisImage.setImageBitmap(bitmap)
                binding.pbQrisLoading.visibility = View.GONE
            }
        }
    }

    private fun checkPaymentStatus() {
        Toast.makeText(this, "Memeriksa status pembayaran...", Toast.LENGTH_SHORT).show()
        val base = CustomerApplication.sessionManager.getServerBaseUrl()
        val token = CustomerApplication.sessionManager.getAuthToken()
        val url = if (base.endsWith("/")) base + "api/customer/invoices/" + invoiceId + "/check-status" else base + "/api/customer/invoices/" + invoiceId + "/check-status"

        lifecycleScope.launch {
            val isPaid = withContext(Dispatchers.IO) {
                try {
                    val client = getUnsafeOkHttpClient()
                    val req = Request.Builder()
                        .url(url)
                        .addHeader("Authorization", "Bearer " + (token ?: ""))
                        .build()
                    val resp = client.newCall(req).execute()
                    if (resp.isSuccessful) {
                        val str = resp.body?.string()
                        if (str != null) JSONObject(str).optJSONObject("data")?.optBoolean("isPaid", false) == true else false
                    } else false
                } catch (_: Exception) { false }
            }

            if (isPaid) {
                AlertDialog.Builder(this@PaymentActivity)
                    .setTitle(" Tagihan LUNAS!")
                    .setMessage("Pembayaran Anda telah sukses diverifikasi oleh sistem. Layanan internet aktif.")
                    .setPositiveButton("Selesai") { _, _ -> finish() }
                    .show()
            } else {
                Toast.makeText(this@PaymentActivity, "Status: Menunggu Pembayaran. Silakan scan QRIS di atas.", Toast.LENGTH_LONG).show()
            }
        }
    }
}

package com.alijaya.customer.ui.admin

import android.content.Context
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.cardview.widget.CardView
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import com.alijaya.customer.CustomerApplication
import com.alijaya.customer.databinding.FragmentAdminVouchersBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONArray
import org.json.JSONObject
import java.text.NumberFormat
import java.util.Locale
import java.util.concurrent.TimeUnit

class AdminVouchersFragment : Fragment() {

    private var _binding: FragmentAdminVouchersBinding? = null
    private val binding get() = _binding!!

    private val colorBgDark = Color.parseColor("#0F172A")
    private val colorCardDark = Color.parseColor("#1E293B")
    private val colorTextWhite = Color.parseColor("#FFFFFF")
    private val colorTextMuted = Color.parseColor("#94A3B8")
    private val colorAccent = Color.parseColor("#38BDF8")
    private val colorGreen = Color.parseColor("#4ADE80")
    private val colorYellow = Color.parseColor("#FACC15")
    private val colorRed = Color.parseColor("#EF4444")
    private val colorBlue = Color.parseColor("#3B82F6")

    private val batchesList = mutableListOf<JSONObject>()
    private var totalVouchersCount = 0
    private var unsoldVouchersCount = 0

    private fun httpClient() = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()

    private fun getBaseUrl(): String {
        val base = CustomerApplication.sessionManager.getServerBaseUrl()
        return if (base.endsWith("/")) base.dropLast(1) else base
    }

    private fun getToken(): String = CustomerApplication.sessionManager.getAuthToken()

    override fun onCreateView(
        inflater: LayoutInflater,
        container: ViewGroup?,
        savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAdminVouchersBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.swipeRefresh.setColorSchemeColors(colorAccent, colorBlue, colorGreen)
        binding.swipeRefresh.setProgressBackgroundColorSchemeColor(colorCardDark)

        binding.swipeRefresh.setOnRefreshListener {
            loadVouchers()
        }

        loadVouchers()
    }

    private fun loadVouchers() {
        val ctx = context ?: return
        binding.swipeRefresh.isRefreshing = true

        val container = binding.contentContainer
        container.removeAllViews()

        val pb = ProgressBar(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                gravity = Gravity.CENTER_HORIZONTAL
                setMargins(0, 80, 0, 80)
            }
        }
        container.addView(pb)

        lifecycleScope.launch {
            val url = "${getBaseUrl()}/api/customer/app/admin/vouchers"
            val responseStr = withContext(Dispatchers.IO) {
                try {
                    val req = Request.Builder()
                        .url(url)
                        .addHeader("Authorization", "Bearer ${getToken()}")
                        .build()
                    val resp = httpClient().newCall(req).execute()
                    if (resp.isSuccessful) resp.body?.string() else null
                } catch (e: Exception) {
                    null
                }
            }

            binding.swipeRefresh.isRefreshing = false
            container.removeView(pb)

            if (responseStr != null) {
                try {
                    val json = JSONObject(responseStr)
                    val data = json.optJSONObject("data")
                    if (data != null) {
                        totalVouchersCount = data.optInt("totalVouchers", 0)
                        unsoldVouchersCount = data.optInt("unsold", 0)

                        val bArr = data.optJSONArray("batches") ?: JSONArray()
                        batchesList.clear()
                        for (i in 0 until bArr.length()) {
                            batchesList.add(bArr.getJSONObject(i))
                        }

                        renderVouchers()
                        return@launch
                    }
                } catch (e: Exception) {
                    // Fallthrough to error
                }
            }

            renderEmptyState("Gagal memuat data voucher hotspot.")
            if (isAdded) {
                Toast.makeText(ctx, "Gagal memuat data voucher", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun renderVouchers() {
        val ctx = context ?: return
        val container = binding.contentContainer
        container.removeAllViews()

        val fmt = NumberFormat.getCurrencyInstance(Locale("id", "ID"))
        fmt.maximumFractionDigits = 0

        val soldCount = (totalVouchersCount - unsoldVouchersCount).coerceAtLeast(0)

        // 1. Summary Card
        val summaryCard = CardView(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 0, 0, 20)
            }
            radius = 24f
            cardElevation = 4f
            setCardBackgroundColor(colorCardDark)
        }

        val summaryLayout = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(32, 28, 32, 28)
        }

        val tvTitle = TextView(ctx).apply {
            text = "🎫 Manajemen Voucher Hotspot"
            setTextColor(colorTextWhite)
            textSize = 17f
            setTypeface(null, Typeface.BOLD)
            setPadding(0, 0, 0, 16)
        }
        summaryLayout.addView(tvTitle)

        val statsRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            weightSum = 3f
        }

        // Box 1: Total
        statsRow.addView(createStatBox(ctx, "Total Cetak", "$totalVouchersCount", colorAccent, Color.parseColor("#1538BDF8"), 0, 4))
        // Box 2: Terjual
        statsRow.addView(createStatBox(ctx, "Terjual", "$soldCount", colorGreen, Color.parseColor("#154ADE80"), 4, 4))
        // Box 3: Belum Terjual (Stok)
        statsRow.addView(createStatBox(ctx, "Sisa Stok", "$unsoldVouchersCount", colorYellow, Color.parseColor("#15FACC15"), 4, 0))

        summaryLayout.addView(statsRow)
        summaryCard.addView(summaryLayout)
        container.addView(summaryCard)

        // Section Title
        val tvSection = TextView(ctx).apply {
            text = "📦 Daftar Batch Voucher (${batchesList.size})"
            setTextColor(colorTextWhite)
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setPadding(8, 6, 0, 14)
        }
        container.addView(tvSection)

        if (batchesList.isEmpty()) {
            renderEmptyState("Belum ada batch voucher yang dicetak.")
            return
        }

        // List Batches
        for (batch in batchesList) {
            val batchId = batch.optString("batch_id", "-")
            val profileName = batch.optString("profile_name", "Voucher Hotspot")
            val price = batch.optDouble("price", 0.0)
            val validity = batch.optString("validity", "-")
            val totalCount = batch.optInt("total_count", 0)
            val batchSoldCount = batch.optInt("sold_count", 0)
            val createdAt = batch.optString("created_at", "-")

            val card = CardView(ctx).apply {
                layoutParams = LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT,
                    LinearLayout.LayoutParams.WRAP_CONTENT
                ).apply {
                    setMargins(0, 0, 0, 18)
                }
                radius = 20f
                cardElevation = 3f
                setCardBackgroundColor(colorCardDark)
            }

            val cardLayout = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(28, 22, 28, 22)
            }

            // Top Row: Profile Name & Batch ID Badge
            val topRow = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }

            val tvProfile = TextView(ctx).apply {
                layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                text = "🎟️ $profileName"
                setTextColor(colorTextWhite)
                textSize = 15.5f
                setTypeface(null, Typeface.BOLD)
            }

            val batchBadgeDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 14f
                setColor(Color.parseColor("#2238BDF8"))
            }

            val tvBatchBadge = TextView(ctx).apply {
                text = "Batch: $batchId"
                setTextColor(colorAccent)
                textSize = 10.5f
                setTypeface(null, Typeface.BOLD)
                setPadding(16, 6, 16, 6)
                background = batchBadgeDrawable
            }

            topRow.addView(tvProfile)
            topRow.addView(tvBatchBadge)
            cardLayout.addView(topRow)

            // Price & Validity Row
            val priceRow = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(0, 10, 0, 8)
            }

            val tvPrice = TextView(ctx).apply {
                text = fmt.format(price)
                setTextColor(colorGreen)
                textSize = 16.5f
                setTypeface(null, Typeface.BOLD)
            }

            val tvValidity = TextView(ctx).apply {
                text = " • ⏱️ Masa Aktif: $validity"
                setTextColor(colorTextMuted)
                textSize = 12f
                setPadding(4, 0, 0, 0)
            }

            priceRow.addView(tvPrice)
            priceRow.addView(tvValidity)
            cardLayout.addView(priceRow)

            // Progress Bar
            val percent = if (totalCount > 0) ((batchSoldCount.toDouble() / totalCount) * 100).toInt() else 0
            val tvProgress = TextView(ctx).apply {
                text = "Terjual: $batchSoldCount / $totalCount voucher ($percent%)"
                setTextColor(colorTextMuted)
                textSize = 11.5f
            }
            cardLayout.addView(tvProgress)
            cardLayout.addView(createProgressBar(ctx, percent, colorGreen))

            // Footer Created At
            val tvDate = TextView(ctx).apply {
                text = "📅 Dibuat: $createdAt"
                setTextColor(colorTextMuted)
                textSize = 11f
                setPadding(0, 4, 0, 0)
            }
            cardLayout.addView(tvDate)

            card.addView(cardLayout)
            container.addView(card)
        }
    }

    private fun createStatBox(
        ctx: Context,
        title: String,
        value: String,
        textColor: Int,
        bgColor: Int,
        marginLeft: Int,
        marginRight: Int
    ): LinearLayout {
        return LinearLayout(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
                setMargins(marginLeft, 0, marginRight, 0)
            }
            orientation = LinearLayout.VERTICAL
            val bgDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 14f
                setColor(bgColor)
            }
            background = bgDrawable
            setPadding(14, 16, 14, 16)

            val tvTitle = TextView(ctx).apply {
                text = title
                setTextColor(colorTextMuted)
                textSize = 11f
            }

            val tvVal = TextView(ctx).apply {
                text = value
                setTextColor(textColor)
                textSize = 16f
                setTypeface(null, Typeface.BOLD)
                setPadding(0, 4, 0, 0)
            }

            addView(tvTitle)
            addView(tvVal)
        }
    }

    private fun createProgressBar(context: Context, percent: Int, progressColor: Int): View {
        val safePercent = percent.coerceIn(0, 100)
        val bg = LinearLayout(context).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                14
            ).apply {
                setMargins(0, 8, 0, 8)
            }
            val bgDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 7f
                setColor(Color.parseColor("#334155"))
            }
            background = bgDrawable
            orientation = LinearLayout.HORIZONTAL
            weightSum = 100f
        }

        val fill = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, safePercent.toFloat())
            val fillDrawable = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                cornerRadius = 7f
                setColor(progressColor)
            }
            background = fillDrawable
        }

        val emptySpace = View(context).apply {
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.MATCH_PARENT, (100 - safePercent).toFloat())
        }

        bg.addView(fill)
        bg.addView(emptySpace)
        return bg
    }

    private fun renderEmptyState(message: String) {
        val ctx = context ?: return
        val container = binding.contentContainer

        val emptyCard = CardView(ctx).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                setMargins(0, 40, 0, 0)
            }
            radius = 24f
            setCardBackgroundColor(colorCardDark)
        }

        val emptyLayout = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(40, 60, 40, 60)
        }

        val tvIcon = TextView(ctx).apply {
            text = "🎫"
            textSize = 36f
            gravity = Gravity.CENTER
        }

        val tvMsg = TextView(ctx).apply {
            text = message
            setTextColor(colorTextMuted)
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 0)
        }

        emptyLayout.addView(tvIcon)
        emptyLayout.addView(tvMsg)
        emptyCard.addView(emptyLayout)
        container.addView(emptyCard)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

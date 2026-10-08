package com.yimu.subtitle

import android.content.Context
import android.content.SharedPreferences

/** 本机保存的少量设置。API Key 只存在这台平板上。 */
object Prefs {
    private fun sp(c: Context): SharedPreferences =
        c.applicationContext.getSharedPreferences("yimu", Context.MODE_PRIVATE)

    fun apiKey(c: Context): String = sp(c).getString("api_key", "") ?: ""
    fun setApiKey(c: Context, v: String) = sp(c).edit().putString("api_key", v.trim()).apply()

    /** true = 只显示中文；false = 双语。 */
    fun zhOnly(c: Context): Boolean = sp(c).getBoolean("zh_only", false)
    fun setZhOnly(c: Context, v: Boolean) = sp(c).edit().putBoolean("zh_only", v).apply()

    /** 字幕条位置：距屏幕底部的距离、相对中心的横向偏移（像素）。-1 表示用默认值。 */
    fun overlayY(c: Context): Int = sp(c).getInt("overlay_y", -1)
    fun overlayX(c: Context): Int = sp(c).getInt("overlay_x", 0)
    fun setOverlayPos(c: Context, x: Int, y: Int) =
        sp(c).edit().putInt("overlay_x", x).putInt("overlay_y", y).apply()
}

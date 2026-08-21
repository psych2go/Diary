package fun.zhuying.diary;

import android.content.ComponentName;

import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsServiceConnection;



public class Application extends android.app.Application {

  @Override
  public void onCreate() {
      super.onCreate();
      // 在后台线程预热浏览器进程，减少 TWA 冷启动时间。
      new Thread(this::warmUpBrowser).start();
  }

  private void warmUpBrowser() {
      try {
          String provider = CustomTabsClient.getPackageName(this, null);
          if (provider == null) {
              return;
          }
          CustomTabsServiceConnection connection = new CustomTabsServiceConnection() {
              @Override
              public void onCustomTabsServiceConnected(ComponentName name, CustomTabsClient client) {
                  client.warmup(0L);
              }

              @Override
              public void onServiceDisconnected(ComponentName name) {
                  // 无需处理
              }
          };
          // 绑定失败时忽略，TWA 会按原方式启动。
          CustomTabsClient.bindCustomTabsService(this, provider, connection);
      } catch (SecurityException | IllegalStateException e) {
          // 浏览器不可用时忽略，TWA 会走 fallback。
      }
  }
}

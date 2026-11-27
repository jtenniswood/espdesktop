using System.Windows;
using System.Windows.Automation;
using System.Windows.Controls;
using System.Windows.Media;

namespace EspDesktop;

internal static class SettingsCard
{
    private const int IconSize = 20;
    private const int IconGap = 16;
    private static readonly FontFamily IconFont = new("Segoe Fluent Icons, Segoe MDL2 Assets");
    private static readonly Thickness Padding = new(16, 12, 16, 12);
    private static readonly Thickness Spacing = new(0, 0, 0, 6);
    private static readonly CornerRadius Corners = new(6);

    public static Border Create(string glyph, string title, string? description = null,
        FrameworkElement? content = null, FrameworkElement? action = null)
    {
        var header = Header(glyph, title, description, action);
        FrameworkElement child = header;
        if (content is not null)
        {
            content.Margin = new Thickness(IconSize + IconGap, 8, 0, 0);
            var stack = new StackPanel();
            stack.Children.Add(header);
            stack.Children.Add(content);
            child = stack;
        }

        var card = new Border
        {
            Child = child,
            MinHeight = 64,
            Padding = Padding,
            Margin = Spacing,
            CornerRadius = Corners,
            BorderThickness = new Thickness(1)
        };
        card.SetResourceReference(Border.BackgroundProperty, "CardBackgroundFillColorDefaultBrush");
        card.SetResourceReference(Border.BorderBrushProperty, "CardStrokeColorDefaultBrush");

        return card;
    }

    public static Button Link(string glyph, string title, string? description, Action open, bool external = false)
    {
        var arrow = Icon(external ? "\uE8A7" : "\uE76C", 16);
        arrow.Margin = new Thickness(16, 0, 0, 0);
        var button = new Button
        {
            Content = Header(glyph, title, description, arrow),
            HorizontalContentAlignment = HorizontalAlignment.Stretch,
            MinHeight = 64,
            Padding = Padding,
            Margin = Spacing,
            BorderThickness = new Thickness(1)
        };
        button.SetValue(Border.CornerRadiusProperty, Corners);
        button.SetResourceReference(Control.BackgroundProperty, "CardBackgroundFillColorDefaultBrush");
        button.SetResourceReference(Control.BorderBrushProperty, "CardStrokeColorDefaultBrush");
        AutomationProperties.SetName(button, title);
        if (description is not null) AutomationProperties.SetHelpText(button, description);
        button.Click += (_, _) => open();
        return button;
    }

    private static DockPanel Header(string glyph, string title, string? description, FrameworkElement? action)
    {
        var header = new DockPanel { VerticalAlignment = VerticalAlignment.Center };
        var icon = Icon(glyph, IconSize);
        icon.Width = IconSize;
        icon.Margin = new Thickness(0, 0, IconGap, 0);
        header.Children.Add(icon);
        if (action is not null)
        {
            action.VerticalAlignment = VerticalAlignment.Center;
            DockPanel.SetDock(action, Dock.Right);
            header.Children.Add(action);
        }

        var labels = new StackPanel { VerticalAlignment = VerticalAlignment.Center };
        labels.Children.Add(new TextBlock
        {
            Text = title, FontSize = 15, FontWeight = FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap
        });
        if (description is not null)
        {
            var subtitle = new TextBlock
            {
                Text = description, FontSize = 14, TextWrapping = TextWrapping.Wrap,
                Margin = new Thickness(0, 2, 0, 0)
            };
            subtitle.SetResourceReference(TextBlock.ForegroundProperty, "TextFillColorSecondaryBrush");
            labels.Children.Add(subtitle);
        }
        header.Children.Add(labels);
        return header;
    }

    public static TextBlock Icon(string glyph, int size) => new()
    {
        Text = glyph, FontFamily = IconFont, FontSize = size, VerticalAlignment = VerticalAlignment.Center
    };
}

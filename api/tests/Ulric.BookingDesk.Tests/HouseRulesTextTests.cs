using Ulric.BookingDesk.Domain.Listings;

namespace Ulric.BookingDesk.Tests;

public class HouseRulesTextTests
{
    [Fact]
    public void Joined_Airbnb_rules_become_one_line_each()
    {
        const string raw = "Check-in after 3:00 PM Checkout before 11:00 AM Self check-in with smart lock 2 guests maximum Pets allowed No parties or events Commercial photography allowed No smoking Additional rules. Please start the dishwasher before you leave.";
        var lines = HouseRulesText.Lines(raw);
        Assert.Equal(
            [
                "Check-in after 3:00 PM",
                "Checkout before 11:00 AM",
                "Self check-in with smart lock",
                "2 guests maximum",
                "Pets allowed",
                "No parties or events",
                "Commercial photography allowed",
                "No smoking",
                "Additional rules. Please start the dishwasher before you leave."
            ],
            lines);
    }

    [Fact]
    public void A_cottage_rule_keeps_no_pets_apart_from_the_guest_limit()
    {
        const string raw = "Check-in after 4:00 PM Checkout before 11:00 AM Self check-in with keypad 2 guests maximum No pets Additional requests. Please just do any dishes.";
        var lines = HouseRulesText.Lines(raw);
        Assert.Contains("2 guests maximum", lines);
        Assert.Contains("No pets", lines);
        Assert.Contains("Additional requests. Please just do any dishes.", lines);
    }
}
